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
  /**
   * 이 항목이 가리키는 장. 책 전체에 대한 항목(제목, 표지 등)이면 없습니다.
   * 장 하나를 공개할 때 그 장에 걸린 차단만 골라내는 데 씁니다.
   */
  chapterIds?: string[];
}

export interface PublishCheckBook {
  title: string;
  description: string | null;
  cover_image_url: string | null;
  price: number;
}

export interface PublishCheckChapter {
  id: string;
  title: string;
  content_html: string;
  status: "draft" | "published";
  order_index: number;
}

/** DB에 저장된 블록 정의와 그 문항. */
export interface StoredBlock {
  id: string;
  chapter_id: string;
  fields: ReadonlyArray<{ field_key: string; input_type: string }>;
}

export interface PublishCheckInput {
  book: PublishCheckBook;
  /** 순서대로(`order_index, created_at, id`). 장 이름의 순번이 이 순서입니다. */
  chapters: readonly PublishCheckChapter[];
  /**
   * 이 책의 `workbook_blocks`에 실제로 저장돼 있는 블록과 그 소속 장·문항.
   *
   * 본문 HTML에는 있는데 여기 없거나 다른 장 소속인 블록은 동기화가
   * 실패했거나 다른 곳과 ID가 겹쳐 건너뛴 것입니다. 그 상태로 출간하면
   * 독자 응답이 저장되지 않거나 다른 장의 블록과 섞입니다. 책 전체의 ID만
   * 보면 다른 장에 저장된 같은 ID를 "저장됨"으로 오인합니다(4-P0-3).
   * 블록은 저장됐는데 새로 넣은 문항만 빠진 경우도 같습니다 — 그 문항의
   * 답은 출간 뒤 전부 거절됩니다(4-P1-21).
   */
  storedBlocks: readonly StoredBlock[];
}

/**
 * 글자 없이도 내용이 되는 요소. 삽화 한 장짜리 장은 빈 장이 아닙니다
 * (4-P1-23).
 */
const MEDIA_ELEMENT = /<(img|video|audio|iframe|svg|picture)\b/i;

/**
 * 내용이 없는 챕터인가.
 *
 * 워크북 블록만 있는 챕터는 비어 있지 않습니다 — 블록의 문항은 속성에
 * 들어 있어서 태그를 걷어내면 글자가 남지 않지만, 독자에게는 그게 본문입니다.
 */
function isEmptyChapter(html: string): boolean {
  if (countWorkbookBlockElements(html) > 0) return false;
  if (MEDIA_ELEMENT.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/\s|&nbsp;/g, "") === "";
}

export function runPublishChecks(input: PublishCheckInput): PublishCheck[] {
  const { book, chapters, storedBlocks } = input;
  const checks: PublishCheck[] = [];

  // 장 이름이 비었으면 편집 화면 목록의 순번으로 부릅니다. `order_index`는
  // 삭제로 틈이 생겨(0, 2, 5) 실제 셋째 장을 "6장"이라 부르게 됩니다
  // (4-P2-12).
  const position = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const label = (chapter: PublishCheckChapter) =>
    chapter.title.trim() || `${(position.get(chapter.id) ?? 0) + 1}장`;
  const list = (items: readonly PublishCheckChapter[]) =>
    items.map(label).join(", ");
  const idsOf = (items: readonly PublishCheckChapter[]) =>
    items.map((chapter) => chapter.id);

  // 에디터에서 보이는 것이지만 차단합니다(2026-10-02 결정) — 이름 없는
  // 책이 탐색 목록·결제 화면에 뜨고, 공개 뒤에도 생길 수 있습니다.
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

  // 독자에게 보이는 것은 published 장뿐입니다. 본문 검사는 그 장만 봅니다 —
  // 작업 중인 draft 장이 출간을 막거나, draft의 블록이 "블록 없음" 경고를
  // 가리면 안 됩니다(4-P1-22).
  const published = chapters.filter((chapter) => chapter.status === "published");
  const drafts = chapters.filter((chapter) => chapter.status === "draft");

  if (published.length === 0) {
    // 소유자 미리보기에는 draft도 보여서 크리에이터는 이 상태를 볼 수
    // 없습니다. 독자는 빈 책을 받고, 미리보기 장도 없습니다(4-P1-20).
    checks.push({
      id: "no-published-chapters",
      level: "blocker",
      title: "공개한 장이 하나도 없어요",
      detail:
        `${list(drafts)} — 모두 비공개 장이라 독자에게는 빈 책으로 보여요. ` +
        "편집 화면에서 장을 열어 '이 장 공개하기'를 눌러 주세요.",
      chapterIds: idsOf(drafts),
    });
  }

  const emptyChapters = published.filter((chapter) =>
    isEmptyChapter(chapter.content_html),
  );
  if (emptyChapters.length > 0) {
    // 에디터에서 보이는 것이라 막지 않습니다(2026-10-02 결정).
    checks.push({
      id: "empty-chapters",
      level: "warning",
      title: `내용이 빈 장이 ${emptyChapters.length}개 있어요`,
      detail: `${list(emptyChapters)} — 독자에게 빈 장으로 보여요. 내용을 채우거나 비공개로 돌려 주세요.`,
      chapterIds: idsOf(emptyChapters),
    });
  }

  if (book.price > 0 && published.length === 1) {
    // 미리보기는 맨 앞 published 장 하나입니다(`book_preview_chapter_id`).
    // 그 장이 유일하면 책 전체가 무료로 열립니다(2026-10-02 결정, WP3).
    checks.push({
      id: "paid-single-chapter",
      level: "warning",
      title: "유료 책인데 공개한 장이 하나뿐이에요",
      detail:
        "맨 앞 장은 누구나 미리보기로 읽을 수 있어서, 장이 하나면 책 전체가 " +
        "무료로 열려요. 장을 나누거나 가격을 다시 정해 주세요.",
      chapterIds: idsOf(published),
    });
  }

  // --- 워크북 블록 ---

  const storedById = new Map(
    storedBlocks.map((block) => [block.id.toLowerCase(), block]),
  );
  const brokenByChapter: PublishCheckChapter[] = [];
  const unsyncedByChapter: PublishCheckChapter[] = [];
  const emptyChecklistChapters: PublishCheckChapter[] = [];
  let answerableBlocks = 0;

  // 블록 ID → 그 ID가 본문에 있는 장들. 둘 이상이면 복사본이 원본 ID를
  // 들고 간 것입니다. 두 장의 독자 답이 한 블록을 나눠 쓰게 됩니다.
  // draft 장도 넣습니다 — DB가 draft 쪽을 소속으로 기록했으면 published
  // 장의 블록이 답을 받지 못합니다. 알리는 것은 published 장만입니다.
  const chaptersById = new Map<string, PublishCheckChapter[]>();

  for (const chapter of chapters) {
    const isPublished = chapter.status === "published";

    // 본문에 있는 블록 수와, 그중 ID가 있어 뽑히는 블록. 두 수가 다르면
    // `data-node-id`가 없는 블록이 있다는 뜻입니다 — 추출 단계에서
    // 조용히 버려지므로 여기서만 드러납니다.
    const present = countWorkbookBlockElements(chapter.content_html);
    if (present === 0) continue;

    const extracted = extractWorkbookBlocks(chapter.content_html);
    const storable = storableBlocks(extracted);

    for (const block of storable) {
      const key = block.id.toLowerCase();
      const holders = chaptersById.get(key) ?? [];
      holders.push(chapter);
      chaptersById.set(key, holders);
    }

    if (!isPublished) continue;

    const idless = present - extracted.length;
    if (
      idless > 0 ||
      unstorableBlocks(extracted).length > 0 ||
      blocksWithUnstorableFields(extracted).length > 0
    ) {
      brokenByChapter.push(chapter);
    }

    // 문항이 있는 블록만 "답할 곳"입니다. 콜아웃만 있는 책은 읽기만 하는
    // 책과 같습니다(4-P2-11).
    answerableBlocks += storable.filter((block) => block.fields.length > 0).length;

    if (
      storable.some(
        (block) => block.block_type === "checklist" && block.fields.length === 0,
      )
    ) {
      emptyChecklistChapters.push(chapter);
    }

    // DB는 uuid를 소문자로 돌려줍니다. 본문의 대문자 ID와도 맞춰 봅니다.
    const missing = storable.filter((block) => {
      const saved = storedById.get(block.id.toLowerCase());
      if (!saved || saved.chapter_id !== chapter.id) return true;
      const savedFields = new Set(
        saved.fields.map((field) => `${field.field_key}\u0000${field.input_type}`),
      );
      return block.fields.some(
        (field) => !savedFields.has(`${field.field_key}\u0000${field.input_type}`),
      );
    });
    if (missing.length > 0) {
      unsyncedByChapter.push(chapter);
    }
  }

  // 겹치는 블록이 있는 장 중, DB가 그 블록의 소속으로 기록한 장이 아닌 쪽
  // (= 나중에 붙여넣은 복사본)을 알려 줍니다. 소속이 어디에도 없으면 전부.
  const duplicatedIn = new Set<PublishCheckChapter>();
  for (const [blockId, holders] of chaptersById) {
    if (holders.length < 2) continue;
    const owner = storedById.get(blockId)?.chapter_id;
    const copies = holders.filter((chapter) => chapter.id !== owner);
    for (const chapter of copies.length < holders.length ? copies : holders) {
      if (chapter.status === "published") duplicatedIn.add(chapter);
    }
  }

  if (duplicatedIn.size > 0) {
    const duplicated = published.filter((chapter) => duplicatedIn.has(chapter));
    checks.push({
      id: "duplicated-blocks",
      level: "blocker",
      title: "같은 블록이 여러 장에 들어 있어요",
      detail:
        `${list(duplicated)} — ` +
        "다른 장의 블록을 복사해 온 것으로 보여요. 두 장의 독자 답이 섞이니 " +
        "그 장에서 블록을 지우고 새로 넣어 주세요.",
      chapterIds: idsOf(duplicated),
    });
  }

  if (brokenByChapter.length > 0) {
    checks.push({
      id: "broken-blocks",
      level: "blocker",
      title: "독자의 답을 저장할 수 없는 블록이 있어요",
      detail:
        `${list(brokenByChapter)} — 블록 ID나 체크리스트 항목 키가 ` +
        "없거나 중복돼 독자가 쓴 답이 저장되지 않아요. 편집 화면에서 그 장을 " +
        "열면 고쳐서 저장돼요. 그래도 남으면 그 블록을 지우고 다시 넣어 주세요.",
      chapterIds: idsOf(brokenByChapter),
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
        `${list(unsyncedOnly)} — 편집 화면에서 그 장을 열어 ` +
        "'저장됨'이 뜬 것을 확인한 뒤 다시 검사해 주세요. 그래도 남으면 " +
        "다른 책에서 복사해 온 블록일 수 있어요. 지우고 새로 넣어 주세요.",
      chapterIds: idsOf(unsyncedOnly),
    });
  }

  if (emptyChecklistChapters.length > 0) {
    checks.push({
      id: "empty-checklists",
      level: "warning",
      title: "항목이 없는 체크리스트가 있어요",
      detail: `${list(emptyChecklistChapters)} — 독자가 체크할 것이 없어요. 항목을 넣거나 블록을 지워 주세요.`,
      chapterIds: idsOf(emptyChecklistChapters),
    });
  }

  if (published.length > 0 && answerableBlocks === 0 && brokenByChapter.length === 0) {
    checks.push({
      id: "no-workbook-blocks",
      level: "warning",
      title: "독자가 답할 블록이 하나도 없어요",
      detail:
        "독자가 답할 곳이 없으면 읽기만 하는 책이 돼요. " +
        "체크리스트나 성찰 블록을 넣어 보세요.",
    });
  }

  if (drafts.length > 0 && published.length > 0) {
    checks.push({
      id: "draft-chapters",
      level: "warning",
      title: `공개하지 않은 장이 ${drafts.length}개 있어요`,
      detail: `${list(drafts)} — 독자에게 보이지 않아요.`,
      chapterIds: idsOf(drafts),
    });
  }

  const inlineImageChapters = published.filter((chapter) =>
    chapter.content_html.includes('src="data:image'),
  );
  if (inlineImageChapters.length > 0) {
    checks.push({
      id: "inline-images",
      level: "warning",
      title: "본문에 직접 붙여 넣은 이미지가 있어요",
      detail:
        `${list(inlineImageChapters)} — 본문이 무거워져 읽기 화면이 느려져요. ` +
        "이미지를 지우고 툴바의 '이미지 삽입'으로 다시 넣어 주세요.",
      chapterIds: idsOf(inlineImageChapters),
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
