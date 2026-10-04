import { marked } from "marked";
import mammoth from "mammoth";
import { sanitizeContent } from "./sanitize";

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
  const level = chapterHeadingLevel(html);
  const splitRe = level === null ? MARKER_SPLIT_RE : HEADING_SPLIT_RE[level];
  const parts = html.split(splitRe).filter((part) => part.trim() !== "");

  if (parts.length <= 1) {
    // 경계를 못 찾으면 한 챕터로 둡니다. 임의로 자르면 크리에이터가
    // 의도한 구조를 망가뜨리고, 되돌릴 방법이 없습니다.
    return [
      {
        title: parts.length === 1 ? extractTitleFromHtml(html, 0, level) : "Chapter 1",
        content_html: sanitizeContent(html),
        content_raw: rawText || toPlainText(html),
      },
    ];
  }

  return parts.map((part, index) => ({
    title: extractTitleFromHtml(part, index, level),
    content_html: sanitizeContent(part),
    content_raw: toPlainText(part),
  }));
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
export function parseTxtToChapters(text: string): ParsedChapter[] {
  const normalized = normalizeNewlines(text);
  const html = normalized
    .split(/\n[ \t]*\n+/)
    .filter((block) => block.trim() !== "")
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return splitHtmlIntoChapters(html, normalized);
}

export async function parseMdToChapters(text: string): Promise<ParsedChapter[]> {
  const normalized = normalizeNewlines(text);
  return splitHtmlIntoChapters(await marked(normalized), normalized);
}

export async function parseDocxToChapters(
  arrayBuffer: ArrayBuffer,
): Promise<ParsedChapter[]> {
  const result = await mammoth.convertToHtml({
    buffer: Buffer.from(arrayBuffer),
  });
  return splitHtmlIntoChapters(result.value, "");
}

/** 확장자에 맞는 파서로 넘깁니다. */
export async function parseUpload(
  file: Blob,
  extension: UploadExtension,
): Promise<ParsedChapter[]> {
  switch (extension) {
    case "txt":
      return parseTxtToChapters(await file.text());
    case "md":
      return parseMdToChapters(await file.text());
    case "docx":
      return parseDocxToChapters(await file.arrayBuffer());
  }
}
