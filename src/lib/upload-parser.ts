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
 * 전방탐색이라 경계 문자열이 다음 챕터의 첫 글자로 남습니다 — 제목을
 * 잘라먹지 않기 위해서입니다.
 */
const CHAPTER_SPLIT_RE = /(?=<h[12][^>]*>)|(?=제\s*\d+\s*장)|(?=Chapter\s+\d+)/i;

/** 파일명에서 확장자와 구분자를 걷어낸 기본 제목. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
}

/** 확장자를 정합니다. MIME이 없거나 모르는 값이면 파일명으로 판정합니다. */
export function resolveExtension(
  mimeType: string,
  fileName: string,
): UploadExtension | null {
  const byMime = ALLOWED_MIME_TYPES[mimeType];
  if (byMime) return byMime;

  const byName = fileName.split(".").pop()?.toLowerCase() ?? "";
  return isUploadExtension(byName) ? byName : null;
}

export function extractTitleFromHtml(html: string, index: number): string {
  const headingMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
  if (headingMatch) {
    return headingMatch[1].replace(/<[^>]*>/g, "").trim();
  }
  const koreanMatch = html.match(/(제\s*\d+\s*장[^\n<]*)/);
  if (koreanMatch) return koreanMatch[1].trim();
  const englishMatch = html.match(/(Chapter\s+\d+[^\n<]*)/i);
  if (englishMatch) return englishMatch[1].trim();
  return `Chapter ${index + 1}`;
}

export function splitHtmlIntoChapters(
  html: string,
  rawText: string,
): ParsedChapter[] {
  const parts = html.split(CHAPTER_SPLIT_RE).filter((part) => part.trim() !== "");

  if (parts.length <= 1) {
    // 경계를 못 찾으면 한 챕터로 둡니다. 임의로 자르면 크리에이터가
    // 의도한 구조를 망가뜨리고, 되돌릴 방법이 없습니다.
    return [
      {
        title: "Chapter 1",
        content_html: sanitizeContent(html),
        content_raw: rawText,
      },
    ];
  }

  return parts.map((part, index) => ({
    title: extractTitleFromHtml(part, index),
    content_html: sanitizeContent(part),
    content_raw: toPlainText(part),
  }));
}

function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTxtToChapters(text: string): ParsedChapter[] {
  const html = text
    .split(/\n\n+/)
    .filter((block) => block.trim() !== "")
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return splitHtmlIntoChapters(html, text);
}

export async function parseMdToChapters(text: string): Promise<ParsedChapter[]> {
  return splitHtmlIntoChapters(await marked(text), text);
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
