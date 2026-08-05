import {
  countWorkbookBlockElements,
  extractWorkbookBlocks,
} from "./workbook/extract-blocks";
import { storableBlocks, unstorableBlocks } from "./workbook/sync-blocks";

/**
 * 공개 전 검수.
 *
 * 이 목록의 목적은 완성도 잔소리가 아니라 **조용한 실패를 막는 것**입니다.
 * 워크북은 크리에이터가 자기 화면에서 확인할 수 없는 방식으로 망가집니다 —
 * 블록에 ID가 없으면 저작 화면에서는 멀쩡히 보이지만 독자가 쓴 내용은
 * 저장될 곳이 없습니다. 그런 항목만 차단(blocker)으로 둡니다.
 *
 * 나머지(커버, 설명 등)는 경고입니다. 출간을 막을 이유가 없습니다.
 */

export type PublishCheckLevel = "blocker" | "warning";

export interface PublishCheck {
  id: string;
  level: PublishCheckLevel;
  /** 화면에 그대로 나갑니다. */
  title: string;
  detail: string;
}

export interface PublishCheckBook {
  title: string;
  description: string | null;
  cover_image_url: string | null;
}

export interface PublishCheckChapter {
  id: string;
  title: string;
  content_html: string;
  status: "draft" | "published";
  order_index: number;
}

export interface PublishCheckInput {
  book: PublishCheckBook;
  chapters: readonly PublishCheckChapter[];
  /**
   * `workbook_blocks`에 실제로 저장돼 있는 블록 ID.
   *
   * 본문 HTML에는 있는데 여기 없는 블록은 동기화가 실패한 것입니다.
   * 그 상태로 출간하면 독자 응답이 저장되지 않습니다.
   */
  storedBlockIds: readonly string[];
}

/**
 * 내용이 없는 챕터인가.
 *
 * 워크북 블록만 있는 챕터는 비어 있지 않습니다 — 블록의 문항은 속성에
 * 들어 있어서 태그를 걷어내면 글자가 남지 않지만, 독자에게는 그게 본문입니다.
 */
function isEmptyChapter(html: string): boolean {
  if (countWorkbookBlockElements(html) > 0) return false;
  return html.replace(/<[^>]*>/g, "").replace(/\s|&nbsp;/g, "") === "";
}

function chapterLabel(chapter: PublishCheckChapter): string {
  return chapter.title.trim() || `${chapter.order_index + 1}번째 챕터`;
}

function listChapters(chapters: readonly PublishCheckChapter[]): string {
  return chapters.map(chapterLabel).join(", ");
}

export function runPublishChecks(input: PublishCheckInput): PublishCheck[] {
  const { book, chapters, storedBlockIds } = input;
  const checks: PublishCheck[] = [];

  if (book.title.trim() === "") {
    checks.push({
      id: "title",
      level: "blocker",
      title: "책 제목이 비어 있습니다",
      detail: "설정에서 제목을 입력하세요.",
    });
  }

  if (chapters.length === 0) {
    checks.push({
      id: "no-chapters",
      level: "blocker",
      title: "챕터가 없습니다",
      detail: "챕터를 최소 한 개 만들어야 공개할 수 있습니다.",
    });
    // 챕터가 없으면 나머지 본문 검사는 볼 것이 없습니다.
    return [...checks, ...metadataWarnings(book)];
  }

  const emptyChapters = chapters.filter((chapter) =>
    isEmptyChapter(chapter.content_html),
  );
  if (emptyChapters.length > 0) {
    checks.push({
      id: "empty-chapters",
      level: "blocker",
      title: `내용이 빈 챕터가 ${emptyChapters.length}개 있습니다`,
      detail: `${listChapters(emptyChapters)} — 내용을 채우거나 챕터를 삭제하세요.`,
    });
  }

  // --- 워크북 블록 ---

  const stored = new Set(storedBlockIds);
  const brokenByChapter: PublishCheckChapter[] = [];
  const unsyncedByChapter: PublishCheckChapter[] = [];
  let totalBlocks = 0;

  for (const chapter of chapters) {
    // 본문에 있는 블록 수와, 그중 ID가 있어 뽑히는 블록. 두 수가 다르면
    // `data-node-id`가 없는 블록이 있다는 뜻입니다 — 추출 단계에서
    // 조용히 버려지므로 여기서만 드러납니다.
    const present = countWorkbookBlockElements(chapter.content_html);
    if (present === 0) continue;

    totalBlocks += present;

    const extracted = extractWorkbookBlocks(chapter.content_html);
    const idless = present - extracted.length;

    if (idless > 0 || unstorableBlocks(extracted).length > 0) {
      brokenByChapter.push(chapter);
    }

    const missing = storableBlocks(extracted).filter(
      (block) => !stored.has(block.id),
    );
    if (missing.length > 0) {
      unsyncedByChapter.push(chapter);
    }
  }

  if (brokenByChapter.length > 0) {
    checks.push({
      id: "broken-blocks",
      level: "blocker",
      title: "응답을 받을 수 없는 워크북 블록이 있습니다",
      detail:
        `${listChapters(brokenByChapter)} — 블록 ID가 없거나 중복돼 독자가 ` +
        "작성한 내용이 저장되지 않습니다. 해당 블록을 지우고 다시 삽입하세요.",
    });
  }

  if (unsyncedByChapter.length > 0) {
    checks.push({
      id: "unsynced-blocks",
      level: "blocker",
      title: "워크북 블록이 아직 저장되지 않았습니다",
      detail:
        `${listChapters(unsyncedByChapter)} — 편집 화면에서 해당 챕터를 열어 ` +
        "저장이 끝난 것을 확인한 뒤 다시 시도하세요.",
    });
  }

  if (totalBlocks === 0) {
    checks.push({
      id: "no-workbook-blocks",
      level: "warning",
      title: "워크북 블록이 하나도 없습니다",
      detail:
        "독자가 직접 작성할 칸이 없으면 일반 전자책과 같습니다. " +
        "체크리스트나 리플렉션 블록을 넣어 보세요.",
    });
  }

  const draftChapters = chapters.filter((chapter) => chapter.status === "draft");
  if (draftChapters.length > 0) {
    checks.push({
      id: "draft-chapters",
      level: "warning",
      title: `미발행 챕터가 ${draftChapters.length}개 있습니다`,
      detail: `${listChapters(draftChapters)} — 독자에게 보이지 않습니다.`,
    });
  }

  const inlineImageChapters = chapters.filter((chapter) =>
    chapter.content_html.includes('src="data:image'),
  );
  if (inlineImageChapters.length > 0) {
    checks.push({
      id: "inline-images",
      level: "warning",
      title: "본문에 인라인 이미지가 남아 있습니다",
      detail:
        `${listChapters(inlineImageChapters)} — 본문이 무거워져 리더가 느려집니다. ` +
        "이미지를 지우고 다시 넣으면 저장소 URL로 바뀝니다.",
    });
  }

  return [...checks, ...metadataWarnings(book)];
}

function metadataWarnings(book: PublishCheckBook): PublishCheck[] {
  const checks: PublishCheck[] = [];

  if (!book.cover_image_url) {
    checks.push({
      id: "cover",
      level: "warning",
      title: "표지가 없습니다",
      detail: "탐색 화면에서 표지 없는 책은 눈에 잘 띄지 않습니다.",
    });
  }

  if (!book.description || book.description.trim() === "") {
    checks.push({
      id: "description",
      level: "warning",
      title: "소개글이 없습니다",
      detail: "독자가 구매를 결정할 때 가장 먼저 읽는 글입니다.",
    });
  }

  return checks;
}

export function blockers(checks: readonly PublishCheck[]): PublishCheck[] {
  return checks.filter((check) => check.level === "blocker");
}

export function warnings(checks: readonly PublishCheck[]): PublishCheck[] {
  return checks.filter((check) => check.level === "warning");
}

export function canPublish(checks: readonly PublishCheck[]): boolean {
  return blockers(checks).length === 0;
}
