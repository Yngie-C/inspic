import { marked } from "marked";
import mammoth from "mammoth";
import { sanitizeContent } from "./sanitize";
import { isRawChapterHtmlTooLong } from "./content-stats";
import { MAX_IMAGE_BYTES, sniffImageType, type ImageMime } from "./image-upload";
import { isChapterImageUrl } from "./storage-image";

/**
 * 원고 파일 → 챕터 목록.
 *
 * API 라우트에서 분리한 이유는 이 로직이 라우트보다 오래 살고, 틀렸을 때
 * 조용히 틀리기 때문입니다. 챕터가 하나로 뭉치거나 제목이 엉뚱하게 잡히면
 * 크리에이터는 원고를 다시 올리는 것 말고는 할 수 있는 게 없습니다.
 */

export type UploadExtension = "txt" | "md" | "docx";

export interface ParsedChapter {
  title: string;
  content_html: string;
  content_raw: string;
}

/**
 * sanitize 전의 장. `html`의 DOCX 그림은 아직 올리지 않은 자리표시
 * (`<img src="upload-image:N">`)입니다 — 올릴 곳(책·장 폴더)은 책을 만든 뒤에야
 * 정해지기 때문입니다. `finishUpload()`가 올리고 sanitize해서 `ParsedChapter`로 만듭니다.
 */
export interface DraftChapter {
  title: string;
  html: string;
  content_raw: string;
}

/** DOCX 안의 그림. 형식과 크기는 `chapter-images` 버킷 기준으로 이미 확인했습니다. */
export interface UploadImage {
  bytes: Uint8Array;
  mime: ImageMime;
}

export interface UploadDraft {
  chapters: DraftChapter[];
  /** `upload-image:N`의 N번째 그림. */
  images: UploadImage[];
}

/** 그림 하나를 `chapter-images`에 올리고 공개 URL을 돌려줍니다. 못 올리면 null. */
export type StoreUploadImage = (
  chapterIndex: number,
  image: UploadImage,
) => Promise<string | null>;

export interface FinishedUpload {
  chapters: ParsedChapter[];
  /**
   * 본문에 넣지 못한 그림 수 — 올리지 못한 DOCX 그림, 읽을 수 없는 형식,
   * Markdown의 바깥 주소 그림. 그 자리에는 대체 글이 남습니다.
   */
  droppedImages: number;
}

/**
 * sanitize 전 원문이 너무 긴 장(코드 리뷰 12-P0-2). sanitize는 jsdom으로 동기
 * 파싱하므로 크기를 먼저 봅니다. 라우트는 어느 장인지 알려 줍니다.
 */
export class UploadChapterTooLongError extends Error {
  constructor(
    readonly index: number,
    readonly title: string,
  ) {
    super(`chapter ${index + 1} is too long`);
    this.name = "UploadChapterTooLongError";
  }
}

/** MIME 타입 → 확장자. 브라우저가 MIME을 안 붙이는 경우가 있어 폴백이 필요합니다. */
export const ALLOWED_MIME_TYPES: Readonly<Record<string, UploadExtension>> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

export const SIZE_LIMITS: Readonly<Record<UploadExtension, number>> = {
  txt: 5 * 1024 * 1024,
  md: 5 * 1024 * 1024,
  docx: 20 * 1024 * 1024,
};

/** `books.source_type`에 넣을 값. */
export const SOURCE_TYPE_BY_EXTENSION: Readonly<
  Record<UploadExtension, "text" | "markdown" | "docx">
> = {
  txt: "text",
  md: "markdown",
  docx: "docx",
};

export function isUploadExtension(value: string): value is UploadExtension {
  return value === "txt" || value === "md" || value === "docx";
}

/**
 * 챕터 경계.
 *
 * 경계는 한 종류만 씁니다. 헤딩과 "제N장" 표기를 함께 보면 `# 제1장 시작`이
 * 두 번 걸려 진짜 장마다 앞에 빈 장이 생깁니다(코드 리뷰 5-P1-1).
 *
 * - 헤딩이 있으면 문서에 있는 가장 높은 단계 하나로만 나눕니다. `#` 장 아래의
 *   `##` 절마다 장이 생기지 않게(5-P1-3), `##`부터 쓴 원고는 `##`로 나뉘게.
 * - 헤딩이 없을 때만 "제N장"/"Chapter N"을 보고, 그것도 **문단 맨 앞**에 올 때만
 *   봅니다. 문장 중간의 "앞의 제2장에서…"가 문단을 자르지 않게(5-P1-2).
 *
 * 전방탐색이라 경계 문자열이 다음 챕터의 첫 글자로 남습니다 — 제목을
 * 잘라먹지 않기 위해서입니다.
 */
const HEADING_SPLIT_RE: Readonly<Record<1 | 2, RegExp>> = {
  1: /(?=<h1[\s>])/i,
  2: /(?=<h2[\s>])/i,
};

/** 문단 여는 태그와, 그 안에서 표기 앞에 올 수 있는 강조 태그. */
const PARAGRAPH_START = String.raw`<p(?:\s[^>]*)?>(?:\s*<(?:strong|b|em|i|span)(?:\s[^>]*)?>)*\s*`;
const CHAPTER_MARKER = String.raw`(?:제\s*\d+\s*장|Chapter\s+\d+\b)`;
const MARKER_SPLIT_RE = new RegExp(`(?=${PARAGRAPH_START}${CHAPTER_MARKER})`, "i");
const MARKER_TITLE_RE = new RegExp(
  `^\\s*${PARAGRAPH_START}(${CHAPTER_MARKER}[^<\\n]*)`,
  "i",
);

/** 문서에서 장 경계로 쓸 헤딩 단계. 헤딩이 없으면 null. */
function chapterHeadingLevel(html: string): 1 | 2 | null {
  if (/<h1[\s>]/i.test(html)) return 1;
  if (/<h2[\s>]/i.test(html)) return 2;
  return null;
}

/** 파일명에서 확장자와 구분자를 걷어낸 기본 제목. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
}

/**
 * 확장자를 정합니다. 파일명의 확장자를 먼저 보고, 없거나 모르는 값이면
 * MIME으로 판정합니다.
 *
 * MIME을 먼저 보면 `.md`를 `text/plain`으로 보내는 OS·브라우저에서
 * 마크다운이 글자 그대로 들어옵니다(5-P2-6).
 */
export function resolveExtension(
  mimeType: string,
  fileName: string,
): UploadExtension | null {
  const byName = fileName.includes(".")
    ? (fileName.split(".").pop()?.toLowerCase() ?? "")
    : "";
  if (isUploadExtension(byName)) return byName;

  return ALLOWED_MIME_TYPES[mimeType] ?? null;
}

/**
 * 장 제목을 뽑습니다. `part`의 맨 앞에 있는 경계(헤딩 또는 장 표기)만
 * 봅니다 — 첫 장 앞의 머리말 조각에서 본문 속 소제목을 제목으로 집지 않게.
 */
export function extractTitleFromHtml(
  html: string,
  index: number,
  level: 1 | 2 | null = chapterHeadingLevel(html),
): string {
  if (level !== null) {
    const heading = html.match(
      new RegExp(`^\\s*<h${level}(?:\\s[^>]*)?>([\\s\\S]*?)</h${level}>`, "i"),
    );
    const title = heading ? htmlToText(heading[1]) : "";
    if (title) return title;
  } else {
    const marker = html.match(MARKER_TITLE_RE);
    const title = marker ? htmlToText(marker[1]) : "";
    if (title) return title;
  }
  return `Chapter ${index + 1}`;
}

export function splitHtmlIntoChapters(
  html: string,
  rawText: string,
): ParsedChapter[] {
  return splitHtmlIntoDrafts(html, rawText).map(sanitizeDraft);
}

/** 장 경계로 나눕니다. sanitize하지 않고, 원문이 너무 긴 장이 있으면 던집니다. */
function splitHtmlIntoDrafts(html: string, rawText: string): DraftChapter[] {
  const level = chapterHeadingLevel(html);
  const splitRe = level === null ? MARKER_SPLIT_RE : HEADING_SPLIT_RE[level];
  const parts = html.split(splitRe).filter((part) => part.trim() !== "");

  // 경계를 못 찾으면 한 챕터로 둡니다. 임의로 자르면 크리에이터가
  // 의도한 구조를 망가뜨리고, 되돌릴 방법이 없습니다.
  const drafts: DraftChapter[] =
    parts.length <= 1
      ? [
          {
            title: parts.length === 1 ? extractTitleFromHtml(html, 0, level) : "Chapter 1",
            html,
            content_raw: rawText || toPlainText(html),
          },
        ]
      : parts.map((part, index) => ({
          title: extractTitleFromHtml(part, index, level),
          html: part,
          content_raw: toPlainText(part),
        }));

  const tooLong = drafts.findIndex((draft) => isRawChapterHtmlTooLong(draft.html));
  if (tooLong !== -1) throw new UploadChapterTooLongError(tooLong, drafts[tooLong].title);
  return drafts;
}

function sanitizeDraft(draft: DraftChapter): ParsedChapter {
  return {
    title: draft.title,
    content_html: sanitizeContent(draft.html),
    content_raw: draft.content_raw,
  };
}

function toPlainText(html: string): string {
  return htmlToText(html.replace(/<[^>]*>/g, " "));
}

/**
 * 태그를 걷고 HTML 엔티티를 풉니다. 제목은 HTML이 아니라 글자로 저장되므로,
 * 풀지 않으면 `Q&amp;A`가 그대로 화면에 나옵니다(5-P1-11).
 */
function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? match;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Windows(CRLF)·옛 Mac(CR) 줄바꿈을 LF로 맞춥니다(5-P1-12). */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * 텍스트 원고. 글자는 글자로 둡니다 — 이스케이프하지 않으면 `<중요>`나
 * `a < b`가 sanitize에 지워지고, 본문에 적힌 `<h1>`이 장을 자릅니다(5-P1-13).
 */
function txtToHtml(normalized: string): string {
  return normalized
    .split(/\n[ \t]*\n+/)
    .filter((block) => block.trim() !== "")
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function parseTxtToChapters(text: string): ParsedChapter[] {
  const normalized = normalizeNewlines(text);
  return splitHtmlIntoChapters(txtToHtml(normalized), normalized);
}

/**
 * Markdown 할 일 목록(`- [ ] 할 일`)의 체크 상자는 sanitize가 `[ ]`/`[x]` 글자로
 * 바꿉니다(코드 리뷰 12-P1-3). 이미 저장된 장에도 같은 규칙이 걸리도록 한 곳에 둡니다.
 */
export async function parseMdToChapters(text: string): Promise<ParsedChapter[]> {
  const normalized = normalizeNewlines(text);
  return splitHtmlIntoChapters(await marked(normalized), normalized);
}

export async function parseDocxToChapters(
  arrayBuffer: ArrayBuffer,
): Promise<ParsedChapter[]> {
  return (await finishUpload(await draftDocx(arrayBuffer))).chapters;
}

const IMAGE_PLACEHOLDER = "upload-image:";
const PLACEHOLDER_SRC = new RegExp(`src="${IMAGE_PLACEHOLDER}(\\d+)"`, "g");

/**
 * DOCX의 그림은 mammoth 기본값(`data:` URI)으로 본문에 넣지 않습니다. sanitize가
 * `data:` 이미지를 지우고(결정 2), 넣는다 해도 그림 몇 장이면 본문 상한을 넘습니다.
 * 바이트만 모아 두고 자리표시를 넣었다가 `finishUpload()`가 `chapter-images`에
 * 올립니다. 버킷이 받지 않는 형식(EMF·TIFF 등)·크기는 여기서 빼고, 대체 글이 남습니다.
 */
async function draftDocx(arrayBuffer: ArrayBuffer): Promise<UploadDraft> {
  const images: UploadImage[] = [];
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(arrayBuffer) },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await image.readAsArrayBuffer());
        } catch {
          return { src: "" };
        }
        const mime = sniffImageType(bytes);
        if (!mime || bytes.byteLength > MAX_IMAGE_BYTES) return { src: "" };
        images.push({ bytes, mime });
        return { src: `${IMAGE_PLACEHOLDER}${images.length - 1}` };
      }),
    },
  );
  return { chapters: splitHtmlIntoDrafts(result.value, ""), images };
}

/**
 * 원고 → sanitize 전의 장 목록. 원문이 너무 긴 장이 있으면
 * `UploadChapterTooLongError`를 던집니다 — 책을 만들기 전에 거절하려고 나눴습니다.
 */
export async function draftUpload(
  file: Blob,
  extension: UploadExtension,
): Promise<UploadDraft> {
  switch (extension) {
    case "txt": {
      const normalized = normalizeNewlines(await file.text());
      return { chapters: splitHtmlIntoDrafts(txtToHtml(normalized), normalized), images: [] };
    }
    case "md": {
      const normalized = normalizeNewlines(await file.text());
      return {
        chapters: splitHtmlIntoDrafts(await marked(normalized), normalized),
        images: [],
      };
    }
    case "docx":
      return draftDocx(await file.arrayBuffer());
  }
}

/**
 * 그림을 올리고 sanitize합니다. `storeImage`가 없거나 null을 돌려준 그림, 우리
 * `chapter-images`가 아닌 주소의 그림(Markdown의 `![](https://…)`)은 sanitize가
 * 대체 글로 바꿉니다. 서버가 바깥 주소를 받아 오지 않는 것은 일부러입니다 — 아무
 * 주소나 받아 오면 내부망을 찌르는 통로(SSRF)가 됩니다.
 */
export async function finishUpload(
  draft: UploadDraft,
  storeImage?: StoreUploadImage,
): Promise<FinishedUpload> {
  let droppedImages = 0;
  const chapters: ParsedChapter[] = [];
  for (const [index, chapter] of draft.chapters.entries()) {
    const stored = new Map<number, string>();
    for (const [, n] of chapter.html.matchAll(PLACEHOLDER_SRC)) {
      const image = draft.images[Number(n)];
      const url = image && storeImage ? await storeImage(index, image) : null;
      if (url && isChapterImageUrl(url)) stored.set(Number(n), url);
    }
    const html = chapter.html.replace(PLACEHOLDER_SRC, (match, n: string) => {
      const url = stored.get(Number(n));
      return url ? `src="${escapeHtml(url)}"` : match;
    });
    droppedImages += countDroppedImages(html);
    chapters.push(sanitizeDraft({ ...chapter, html }));
  }
  return { chapters, droppedImages };
}

const IMG_TAG = /<img\b[^>]*>/gi;
const SRC_ATTR = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** sanitize가 대체 글로 바꿀 그림 수. 판정은 sanitize와 같은 `isChapterImageUrl()`. */
function countDroppedImages(html: string): number {
  let count = 0;
  for (const [tag] of html.matchAll(IMG_TAG)) {
    const match = SRC_ATTR.exec(tag);
    const src = decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
    if (!isChapterImageUrl(src)) count++;
  }
  return count;
}

/** 확장자에 맞는 파서로 넘깁니다. 그림은 올리지 않고 대체 글로 남깁니다. */
export async function parseUpload(
  file: Blob,
  extension: UploadExtension,
): Promise<ParsedChapter[]> {
  return (await finishUpload(await draftUpload(file, extension))).chapters;
}
