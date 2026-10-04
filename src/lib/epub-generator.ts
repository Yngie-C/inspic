import type { Book, Chapter } from "@/types";
import { applyTemplateFallback } from "./template-fallback";
import {
  EXTENSION_BY_MIME,
  MAX_IMAGE_BYTES,
  sniffImageType,
  type ImageMime,
} from "./image-upload";
import { CHAPTER_IMAGES_BUCKET, COVERS_BUCKET } from "./storage-cleanup";

// ── Minimal ZIP builder (no external dependency) ──────────────────────────

// CRC-32 table
const crcTable = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c);
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}

function uint32LE(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >> 8) & 0xff,
    (n >> 16) & 0xff,
    (n >> 24) & 0xff,
  ]);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

const encoder = new TextEncoder();
const enc = (s: string) => encoder.encode(s);

// DOS date/time for a fixed timestamp (2024-01-01 00:00:00)
const DOS_TIME = 0x0000;
const DOS_DATE = 0x5421; // 2024-01-01

interface ZipEntry {
  name: string;
  data: Uint8Array;
  method: 0 | 8; // 0=stored, 8=deflate (we use stored for simplicity)
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    offsets.push(offset);

    // Local file header
    const localHeader = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
      uint16LE(20),          // version needed
      uint16LE(0),           // flags
      uint16LE(0),           // compression (stored)
      uint16LE(DOS_TIME),
      uint16LE(DOS_DATE),
      uint32LE(crc),
      uint32LE(size),        // compressed
      uint32LE(size),        // uncompressed
      uint16LE(nameBytes.length),
      uint16LE(0),           // extra length
      nameBytes,
      data,
    );

    localHeaders.push(localHeader);
    offset += localHeader.length;

    // Central directory header
    const centralHeader = concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
      uint16LE(20),          // version made by
      uint16LE(20),          // version needed
      uint16LE(0),           // flags
      uint16LE(0),           // compression
      uint16LE(DOS_TIME),
      uint16LE(DOS_DATE),
      uint32LE(crc),
      uint32LE(size),
      uint32LE(size),
      uint16LE(nameBytes.length),
      uint16LE(0),           // extra length
      uint16LE(0),           // comment length
      uint16LE(0),           // disk start
      uint16LE(0),           // internal attrs
      uint32LE(0),           // external attrs
      uint32LE(offsets[offsets.length - 1]),
      nameBytes,
    );

    centralHeaders.push(centralHeader);
  }

  const centralDir = concat(...centralHeaders);
  const centralOffset = offset;
  const centralSize = centralDir.length;

  // End of central directory
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]), // signature
    uint16LE(0),             // disk number
    uint16LE(0),             // central dir disk
    uint16LE(entries.length),
    uint16LE(entries.length),
    uint32LE(centralSize),
    uint32LE(centralOffset),
    uint16LE(0),             // comment length
  );

  const allParts = concat(...localHeaders, centralDir, eocd);
  return Buffer.from(allParts);
}

// ── XML/HTML escaping ─────────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 장 파일은 XML로 파싱됩니다. HTML 직렬화 결과를 그대로 넣으면 리더기가
 * 그 장을 열지 못하는데, 깨진 채로도 내려받기는 200으로 끝나서 아무도
 * 모릅니다. 여기서 맞추는 것은 세 가지입니다.
 *
 * - 빈 요소(`<br>`, `<img>`, sanitize가 남기는 체크박스 `<input>` …)를 닫습니다.
 * - 속성값의 `<`·`>`를 이스케이프하고, 값 없는 속성에 값을 붙입니다.
 * - 이름 엔티티는 XML의 다섯 개만 남기고 숫자로 바꿉니다. DTD 없는
 *   XHTML에서 `&nbsp;`는 정의되지 않은 엔티티(치명적 오류)입니다.
 */
export function toXhtml(html: string): string {
  if (!html) return "<p></p>";
  return html
    .replace(START_TAG, (_tag, name: string, attrs: string, selfClosing: string) => {
      const closed = selfClosing || VOID_ELEMENTS.has(name.toLowerCase()) ? "/" : "";
      return `<${name}${xmlAttributes(attrs)}${closed}>`;
    })
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);|&/gi, (entity, name?: string) => {
      if (!name) return "&amp;";
      if (name.startsWith("#") || XML_ENTITIES.has(name)) return entity;
      const code = NAMED_ENTITIES.get(name);
      return code === undefined ? `&amp;${name};` : `&#${code};`;
    });
}

/** 속성은 따옴표 단위로 건넙니다. 속성값 안의 `>`에서 태그가 끝나지 않게. */
const ATTRIBUTE = String.raw`\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?`;
const START_TAG = new RegExp(String.raw`<([a-zA-Z][a-zA-Z0-9-]*)((?:${ATTRIBUTE})*)\s*(\/?)>`, "g");
const ATTRIBUTE_PARTS =
  /\s+([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);

/** 붙여넣은 글에 흔한 것만. 모르는 이름은 글자 그대로(`&amp;이름;`) 둡니다. */
const NAMED_ENTITIES: ReadonlyMap<string, number> = new Map([
  ["nbsp", 160], ["copy", 169], ["reg", 174], ["middot", 183], ["times", 215],
  ["ndash", 8211], ["mdash", 8212], ["lsquo", 8216], ["rsquo", 8217],
  ["ldquo", 8220], ["rdquo", 8221], ["bull", 8226], ["hellip", 8230],
  ["trade", 8482],
]);

function xmlAttributes(attrs: string): string {
  let out = "";
  for (const [, name, double, single, bare] of attrs.matchAll(ATTRIBUTE_PARTS)) {
    const value = (double ?? single ?? bare ?? "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    out += ` ${name}="${value}"`;
  }
  return out;
}

// ── 이미지 ────────────────────────────────────────────────────────────────

/**
 * 본문 이미지는 파일 안에 넣습니다. EPUB 3에서 원격 리소스로 둘 수 있는
 * 것은 오디오·비디오·폰트뿐이라, 이미지 URL을 그대로 두면 검증에 실패하고
 * Apple Books나 오프라인 리더기에서 빈 칸으로 나옵니다.
 */
export interface EpubImage {
  data: Uint8Array;
  mime: ImageMime;
}

/** 이미지 `src` → 파일. 담을 수 없으면 null이고, 그 이미지는 대체 글로 나갑니다. */
export type EpubImageLoader = (src: string) => Promise<EpubImage | null>;

const IMAGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * 우리 Storage의 공개 이미지만 받아 옵니다. 본문의 `src`는 저자가 정하는
 * 값이라, 아무 주소나 서버에서 받아 오면 내부망을 찌르는 통로가 됩니다.
 */
export async function loadStorageImage(src: string): Promise<EpubImage | null> {
  const dataUri = src.match(/^data:image\/[a-z+.-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (dataUri) return checkedImage(Buffer.from(dataUri[1], "base64"));

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const allowedPrefixes = [CHAPTER_IMAGES_BUCKET, COVERS_BUCKET].map(
    (bucket) => `/storage/v1/object/public/${bucket}/`,
  );
  if (
    url.origin !== new URL(base).origin ||
    !allowedPrefixes.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return null;
  }

  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length"));
    if (declared > MAX_IMAGE_BYTES) return null;
    return checkedImage(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    console.error("[epub] 이미지를 받지 못했습니다", { src, error });
    return null;
  }
}

/** 형식은 앞머리로 판정합니다. 업로드와 같은 기준입니다. */
function checkedImage(data: Uint8Array): EpubImage | null {
  if (data.byteLength > MAX_IMAGE_BYTES) return null;
  const mime = sniffImageType(data);
  return mime ? { data, mime } : null;
}

interface PackagedImage {
  /** `OEBPS/` 기준 경로. */
  href: string;
  mime: ImageMime;
  data: Uint8Array;
}

const IMG_TAG = new RegExp(String.raw`<img((?:${ATTRIBUTE})*)\s*\/?>`, "gi");

/**
 * 장 HTML의 `<img>`를 파일 안의 이미지로 바꿉니다. 같은 이미지는 한 번만
 * 담습니다. 담지 못한 이미지는 `alt`를 글로 남기고 태그를 뺍니다 — 원격
 * 주소로 남기면 파일 전체가 규격에 어긋납니다.
 */
async function packageImages(
  html: string,
  images: Map<string, PackagedImage | null>,
  loadImage: EpubImageLoader,
): Promise<string> {
  const tags = [...html.matchAll(IMG_TAG)];
  for (const [, attrs] of tags) {
    const src = decodeAttribute(attributeValue(attrs, "src"));
    if (!src || images.has(src)) continue;
    const image = await loadImage(src);
    images.set(
      src,
      image && {
        href: `images/image-${images.size + 1}.${EXTENSION_BY_MIME.get(image.mime)}`,
        ...image,
      },
    );
  }

  return html.replace(IMG_TAG, (_tag, attrs: string) => {
    const src = decodeAttribute(attributeValue(attrs, "src"));
    const packaged = images.get(src);
    if (!packaged) {
      // 속성값의 `<`·`>`는 직렬화에서 이스케이프되지 않은 채 옵니다.
      const alt = attributeValue(attrs, "alt").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return alt ? `<span>${alt}</span>` : "";
    }
    const rest = attrs.replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, "");
    return `<img src="../${packaged.href}"${rest}>`;
  });
}

function attributeValue(attrs: string, name: string): string {
  for (const [, attr, double, single, bare] of attrs.matchAll(ATTRIBUTE_PARTS)) {
    if (attr.toLowerCase() === name) return double ?? single ?? bare ?? "";
  }
  return "";
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// ── EPUB file templates ────────────────────────────────────────────────────

function mimetypeFile(): string {
  return "application/epub+zip";
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function contentOpf(
  book: Book,
  chapters: Chapter[],
  authorName: string,
  images: readonly PackagedImage[],
): string {
  const now = new Date().toISOString().slice(0, 10);
  const manifestItems = chapters
    .map(
      (ch, i) =>
        `    <item id="chapter${i + 1}" href="chapters/chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .concat(
      images.map(
        (image, i) =>
          `    <item id="image${i + 1}" href="${image.href}" media-type="${image.mime}"/>`,
      ),
    )
    .join("\n");

  const spineItems = chapters
    .map((_, i) => `    <itemref idref="chapter${i + 1}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" xml:lang="${book.language || "ko"}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:${book.id}</dc:identifier>
    <dc:title>${xmlEscape(book.title)}</dc:title>
    <dc:creator>${xmlEscape(authorName)}</dc:creator>
    <dc:language>${book.language || "ko"}</dc:language>
    <dc:date>${now}</dc:date>
    ${book.description ? `<dc:description>${xmlEscape(book.description)}</dc:description>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav" linear="no"/>
${spineItems}
  </spine>
</package>`;
}

function tocNcx(book: Book, chapters: Chapter[], authorName: string): string {
  const navPoints = chapters
    .map(
      (ch, i) => `  <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
    <navLabel><text>${xmlEscape(ch.title)}</text></navLabel>
    <content src="chapters/chapter-${i + 1}.xhtml"/>
  </navPoint>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${book.id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(book.title)}</text></docTitle>
  <docAuthor><text>${xmlEscape(authorName)}</text></docAuthor>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

function navXhtml(book: Book, chapters: Chapter[]): string {
  const navItems = chapters
    .map(
      (ch, i) =>
        `      <li><a href="chapters/chapter-${i + 1}.xhtml">${xmlEscape(ch.title)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${book.language || "ko"}">
<head>
  <meta charset="UTF-8"/>
  <title>목차 - ${xmlEscape(book.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
}

function chapterXhtml(book: Book, chapter: Chapter, index: number, html: string): string {
  const body = toXhtml(html);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${book.language || "ko"}">
<head>
  <meta charset="UTF-8"/>
  <title>${xmlEscape(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body>
  <section epub:type="chapter" id="chapter-${index + 1}">
    <h1 class="chapter-title">${xmlEscape(chapter.title)}</h1>
    <div class="chapter-content">
${body}
    </div>
  </section>
</body>
</html>`;
}

function styleCss(): string {
  return `/* EPUB stylesheet */
body {
  font-family: "Noto Serif", "Source Han Serif", Georgia, serif;
  font-size: 1em;
  line-height: 1.75;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
}

h1.chapter-title {
  font-size: 1.8em;
  font-weight: bold;
  margin: 2em 0 1em;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 0.5em;
  line-height: 1.3;
}

.chapter-content p {
  margin: 0 0 1em;
  text-align: justify;
  text-indent: 1em;
}

.chapter-content h1,
.chapter-content h2,
.chapter-content h3 {
  font-weight: bold;
  margin: 1.5em 0 0.75em;
  line-height: 1.3;
}

.chapter-content h1 { font-size: 1.5em; }
.chapter-content h2 { font-size: 1.3em; }
.chapter-content h3 { font-size: 1.1em; }

.chapter-content blockquote {
  border-left: 3px solid #ccc;
  margin: 1em 0 1em 1em;
  padding-left: 1em;
  color: #555;
  font-style: italic;
}

.chapter-content pre,
.chapter-content code {
  font-family: "Courier New", monospace;
  font-size: 0.9em;
  background: #f5f5f5;
}

.chapter-content pre {
  padding: 1em;
  overflow-x: auto;
  white-space: pre-wrap;
}

.chapter-content ul,
.chapter-content ol {
  margin: 1em 0;
  padding-left: 2em;
}

.chapter-content li {
  margin-bottom: 0.4em;
}

nav ol {
  list-style: none;
  padding: 0;
}

nav li {
  margin: 0.5em 0;
  border-bottom: 1px dotted #ccc;
  padding-bottom: 0.4em;
}

nav a {
  text-decoration: none;
  color: #333;
}

nav a:hover {
  color: #000;
}
`;
}

// ── Main export function ───────────────────────────────────────────────────

export async function generateEpub(
  book: Book,
  chapters: Chapter[],
  authorName: string,
  loadImage: EpubImageLoader = loadStorageImage,
): Promise<Buffer> {
  const entries: ZipEntry[] = [];

  const images = new Map<string, PackagedImage | null>();
  const bodies: string[] = [];
  for (const chapter of chapters) {
    const html = applyTemplateFallback(
      chapter.content_html || `<p>${xmlEscape(chapter.content_raw || "")}</p>`,
    );
    bodies.push(await packageImages(html, images, loadImage));
  }
  const packaged = [...images.values()].filter(
    (image): image is PackagedImage => image !== null,
  );

  const addEntry = (name: string, content: string) => {
    entries.push({ name, data: enc(content), method: 0 });
  };

  // mimetype MUST be the first entry and MUST be stored (not compressed)
  addEntry("mimetype", mimetypeFile());

  // META-INF
  addEntry("META-INF/container.xml", containerXml());

  // OEBPS
  addEntry("OEBPS/content.opf", contentOpf(book, chapters, authorName, packaged));
  addEntry("OEBPS/toc.ncx", tocNcx(book, chapters, authorName));
  addEntry("OEBPS/nav.xhtml", navXhtml(book, chapters));
  addEntry("OEBPS/styles/style.css", styleCss());

  // Chapters
  for (let i = 0; i < chapters.length; i++) {
    addEntry(
      `OEBPS/chapters/chapter-${i + 1}.xhtml`,
      chapterXhtml(book, chapters[i], i, bodies[i]),
    );
  }

  for (const image of packaged) {
    entries.push({ name: `OEBPS/${image.href}`, data: image.data, method: 0 });
  }

  return buildZip(entries);
}
