import {
  countWorkbookBlockElements,
  extractWorkbookBlocks,
} from "./workbook/extract-blocks";
import {
  blocksWithUnstorableFields,
  storableBlocks,
  unstorableBlocks,
} from "./workbook/sync-blocks";

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
   * 이 책의 `workbook_blocks`에 실제로 저장돼 있는 블록과 그 소속 장.
   *
   * 본문 HTML에는 있는데 여기 없거나 다른 장 소속인 블록은 동기화가
   * 실패했거나 다른 곳과 ID가 겹쳐 건너뛴 것입니다. 그 상태로 출간하면
   * 독자 응답이 저장되지 않거나 다른 장의 블록과 섞입니다. 책 전체의 ID만
   * 보면 다른 장에 저장된 같은 ID를 "저장됨"으로 오인합니다(4-P0-3).
   */
  storedBlocks: ReadonlyArray<{ id: string; chapter_id: string }>;
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
  return chapter.title.trim() || `${chapter.order_index + 1}장`;
}

function listChapters(chapters: readonly PublishCheckChapter[]): string {
  return chapters.map(chapterLabel).join(", ");
}

export function runPublishChecks(input: PublishCheckInput): PublishCheck[] {
  const { book, chapters, storedBlocks } = input;
  const checks: PublishCheck[] = [];

  if (book.title.trim() === "") {
    checks.push({
      id: "title",
      level: "blocker",
      title: "책 제목이 비어 있어요",
      detail: "편집 화면의 설정에서 제목을 입력해 주세요.",
    });
  }

  if (chapters.length === 0) {
    checks.push({
      id: "no-chapters",
      level: "blocker",
      title: "장이 하나도 없어요",
      detail: "장을 하나 이상 만들어야 공개할 수 있어요.",
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
      title: `내용이 빈 장이 ${emptyChapters.length}개 있어요`,
      detail: `${listChapters(emptyChapters)} — 내용을 채우거나 그 장을 삭제해 주세요.`,
    });
  }

  // --- 워크북 블록 ---

  const storedChapterOf = new Map(
    storedBlocks.map((block) => [block.id, block.chapter_id]),
  );
  const brokenByChapter: PublishCheckChapter[] = [];
  const unsyncedByChapter: PublishCheckChapter[] = [];
  let totalBlocks = 0;

  // 블록 ID → 그 ID가 본문에 있는 장들. 둘 이상이면 복사본이 원본 ID를
  // 들고 간 것입니다. 두 장의 독자 답이 한 블록을 나눠 쓰게 됩니다.
  const chaptersById = new Map<string, PublishCheckChapter[]>();

  for (const chapter of chapters) {
    // 본문에 있는 블록 수와, 그중 ID가 있어 뽑히는 블록. 두 수가 다르면
    // `data-node-id`가 없는 블록이 있다는 뜻입니다 — 추출 단계에서
    // 조용히 버려지므로 여기서만 드러납니다.
    const present = countWorkbookBlockElements(chapter.content_html);
    if (present === 0) continue;

    totalBlocks += present;

    const extracted = extractWorkbookBlocks(chapter.content_html);
    const idless = present - extracted.length;

    if (
      idless > 0 ||
      unstorableBlocks(extracted).length > 0 ||
      blocksWithUnstorableFields(extracted).length > 0
    ) {
      brokenByChapter.push(chapter);
    }

    const storable = storableBlocks(extracted);
    for (const block of storable) {
      const key = block.id.toLowerCase();
      const holders = chaptersById.get(key) ?? [];
      holders.push(chapter);
      chaptersById.set(key, holders);
    }

    // DB는 uuid를 소문자로 돌려줍니다. 본문의 대문자 ID와도 맞춰 봅니다.
    const missing = storable.filter(
      (block) => storedChapterOf.get(block.id.toLowerCase()) !== chapter.id,
    );
    if (missing.length > 0) {
      unsyncedByChapter.push(chapter);
    }
  }

  // 겹치는 블록이 있는 장 중, DB가 그 블록의 소속으로 기록한 장이 아닌 쪽
  // (= 나중에 붙여넣은 복사본)을 알려 줍니다. 소속이 어디에도 없으면 전부.
  const duplicatedIn = new Set<PublishCheckChapter>();
  for (const [blockId, holders] of chaptersById) {
    if (holders.length < 2) continue;
    const owner = storedChapterOf.get(blockId);
    const copies = holders.filter((chapter) => chapter.id !== owner);
    for (const chapter of copies.length < holders.length ? copies : holders) {
      duplicatedIn.add(chapter);
    }
  }

  if (duplicatedIn.size > 0) {
    checks.push({
      id: "duplicated-blocks",
      level: "blocker",
      title: "같은 블록이 여러 장에 들어 있어요",
      detail:
        `${listChapters(chapters.filter((chapter) => duplicatedIn.has(chapter)))} — ` +
        "다른 장의 블록을 복사해 온 것으로 보여요. 두 장의 독자 답이 섞이니 " +
        "그 장에서 블록을 지우고 새로 넣어 주세요.",
    });
  }

  if (brokenByChapter.length > 0) {
    checks.push({
      id: "broken-blocks",
      level: "blocker",
      title: "독자의 답을 저장할 수 없는 블록이 있어요",
      detail:
        `${listChapters(brokenByChapter)} — 블록 ID나 체크리스트 항목 키가 ` +
        "없거나 중복돼 독자가 쓴 답이 저장되지 않아요. 편집 화면에서 그 장을 " +
        "열면 고쳐서 저장돼요. 그래도 남으면 그 블록을 지우고 다시 넣어 주세요.",
    });
  }

  // 겹침으로 이미 안내한 장은 여기서 다시 말하지 않습니다 — 원인이 같고,
  // "열어서 저장"으로는 풀리지 않습니다.
  const unsyncedOnly = unsyncedByChapter.filter(
    (chapter) => !duplicatedIn.has(chapter),
  );
  if (unsyncedOnly.length > 0) {
    checks.push({
      id: "unsynced-blocks",
      level: "blocker",
      title: "워크북 블록이 아직 저장되지 않았어요",
      detail:
        `${listChapters(unsyncedOnly)} — 편집 화면에서 그 장을 열어 ` +
        "'저장됨'이 뜬 것을 확인한 뒤 다시 검사해 주세요. 그래도 남으면 " +
        "다른 책에서 복사해 온 블록일 수 있어요. 지우고 새로 넣어 주세요.",
    });
  }

  if (totalBlocks === 0) {
    checks.push({
      id: "no-workbook-blocks",
      level: "warning",
      title: "워크북 블록이 하나도 없어요",
      detail:
        "독자가 답할 곳이 없으면 읽기만 하는 책이 돼요. " +
        "체크리스트나 성찰 블록을 넣어 보세요.",
    });
  }

  const draftChapters = chapters.filter((chapter) => chapter.status === "draft");
  if (draftChapters.length > 0) {
    checks.push({
      id: "draft-chapters",
      level: "warning",
      title: `공개하지 않은 장이 ${draftChapters.length}개 있어요`,
      detail: `${listChapters(draftChapters)} — 독자에게 보이지 않아요.`,
    });
  }

  const inlineImageChapters = chapters.filter((chapter) =>
    chapter.content_html.includes('src="data:image'),
  );
  if (inlineImageChapters.length > 0) {
    checks.push({
      id: "inline-images",
      level: "warning",
      title: "본문에 직접 붙여 넣은 이미지가 있어요",
      detail:
        `${listChapters(inlineImageChapters)} — 본문이 무거워져 읽기 화면이 느려져요. ` +
        "이미지를 지우고 툴바의 '이미지 삽입'으로 다시 넣어 주세요.",
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
      title: "표지가 없어요",
      detail: "탐색 화면에서 표지 없는 책은 눈에 잘 띄지 않아요.",
    });
  }

  if (!book.description || book.description.trim() === "") {
    checks.push({
      id: "description",
      level: "warning",
      title: "소개글이 없어요",
      detail: "독자가 살지 말지 정할 때 가장 먼저 읽는 글이에요.",
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
