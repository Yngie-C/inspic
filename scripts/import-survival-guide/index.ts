/**
 * s-growthlab의 전자책 「생존하라, 이 각박한 세상속에서」를 SecretTome 책 한 권으로 옮깁니다.
 * 1회용 스크립트입니다.
 *
 * 원본은 Sanity(project nirsga3e)의 `guidebook`(slug survival-guide)과 장 7개입니다.
 * 공개 데이터셋이라 토큰 없이 읽습니다.
 *
 *   # 확인만 (기본값) — DB에 쓰지 않고 장 HTML·이미지·미리보기를 out 폴더(기본: 임시 폴더)에 씁니다.
 *   npx tsx scripts/import-survival-guide/index.ts [--out <폴더>]
 *
 *   # 실제로 옮기기 — 저자 계정으로 로그인해 그 계정의 비공개 초안으로 만듭니다.
 *   IMPORT_EMAIL=... IMPORT_PASSWORD=... \
 *     npx tsx --env-file=.env.local scripts/import-survival-guide/index.ts --apply
 *
 * service role 키를 쓰지 않습니다. 저자 세션으로 쓰므로 RLS·Storage 정책·RPC 권한을
 * 앱의 업로드 경로(`/api/upload`)와 똑같이 거칩니다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { sanitizeContent } from "../../src/lib/sanitize";
import { countWords, isChapterHtmlTooLong } from "../../src/lib/content-stats";
import { EXTENSION_BY_MIME, MAX_IMAGE_BYTES, sniffImageType, type ImageMime } from "../../src/lib/image-upload";
import { CHAPTER_IMAGES_BUCKET } from "../../src/lib/storage-cleanup";
import { generateNodeId } from "../../src/lib/template-node-id";
import { countWorkbookBlockElements, extractWorkbookBlocks } from "../../src/lib/workbook/extract-blocks";
import { syncChapterWorkbookBlocks } from "../../src/lib/workbook/sync-blocks";
import { CHECKLISTS } from "./checklists";
import {
  convertChapterBody,
  escapeHtml,
  imagePlaceholder,
  type ImageRef,
  type PtNode,
} from "./portable-text";

const SANITY_PROJECT_ID = "nirsga3e";
const SANITY_DATASET = "production";
const SANITY_QUERY_URL = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}`;

const BOOK_TITLE = "생존하라, 이 각박한 세상속에서";
const BOOK_PRICE = 9900;
const EXPECTED_CHAPTERS = 7;

const CHECKLIST_HEADING = "자가진단";
const CHECKLIST_INTRO = "이 장의 내용을 지금 내 사업에 비춰 보세요. 해당하는 항목에 체크하면 됩니다.";

interface SanityGuidebook {
  title: string;
  description: string | null;
  chapters: Array<{
    title: string;
    orderIndex: number;
    estimatedReadingTime: number | null;
    body: PtNode[] | null;
  }>;
}

interface PreparedImage extends ImageRef {
  bytes: Uint8Array;
  mime: ImageMime;
  /** 미리보기 폴더 안의 파일 이름. */
  fileName: string;
}

interface PreparedChapter {
  id: string;
  title: string;
  orderIndex: number;
  estimatedReadingTime: number | null;
  /** 이미지 `src`가 자리표시자인 HTML. 아직 sanitize 전입니다. */
  draftHtml: string;
  images: PreparedImage[];
  footnoteCount: number;
  calloutCount: number;
  checklistItemCount: number;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const outIndex = args.indexOf("--out");
  // 저장소 안에 결과물이 남지 않게 기본값은 임시 폴더입니다.
  const outDir = path.resolve(
    outIndex !== -1 && args[outIndex + 1]
      ? args[outIndex + 1]
      : path.join(tmpdir(), "survival-guide-import-preview"),
  );

  const guidebook = await fetchGuidebook();
  const chapters = await prepareChapters(guidebook);

  // 미리보기 HTML로 먼저 전 과정을 검사합니다. 실제 URL만 다를 뿐 --apply와 같은 검사입니다.
  const previews = chapters.map((chapter) =>
    finalizeHtml(chapter, (image) => `images/${image.fileName}`),
  );
  printSummary(chapters, previews);
  await writePreview(outDir, guidebook, chapters, previews);
  console.log(`\n미리보기: ${path.join(outDir, "index.html")}`);

  if (!apply) {
    console.log("확인만 했습니다. DB에 쓰려면 --apply를 붙여 다시 실행하세요.");
    return;
  }
  await importBook(guidebook, chapters);
}

// ─── 원본 읽기 ────────────────────────────────────────────────────────────────

async function fetchGuidebook(): Promise<SanityGuidebook> {
  const query = `*[_type == "guidebook" && slug.current == "survival-guide" && language == "ko"][0]{
    title, description,
    "chapters": chapters[]->{ title, orderIndex, estimatedReadingTime, body } | order(orderIndex asc)
  }`;
  const response = await fetch(`${SANITY_QUERY_URL}?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Sanity 조회 실패: ${response.status}`);
  const { result } = (await response.json()) as { result: SanityGuidebook | null };
  if (!result) throw new Error("Sanity에 survival-guide(ko) 가이드북이 없습니다.");
  if (result.chapters.length !== EXPECTED_CHAPTERS) {
    throw new Error(`장이 ${EXPECTED_CHAPTERS}개여야 하는데 ${result.chapters.length}개입니다.`);
  }
  return result;
}

async function prepareChapters(guidebook: SanityGuidebook): Promise<PreparedChapter[]> {
  const prepared: PreparedChapter[] = [];
  const usedChecklists = new Set<number>();

  for (const source of guidebook.chapters) {
    if (!source.body?.length) throw new Error(`본문이 빈 장: ${source.title}`);
    const converted = convertChapterBody(source.body, {
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      newBlockId: generateNodeId,
    });

    let html = converted.html;
    const checklist = CHECKLISTS.find((c) => c.sanityOrderIndex === source.orderIndex);
    if (checklist) {
      usedChecklists.add(checklist.sanityOrderIndex);
      html = appendChecklist(html, checklist.items);
    }

    const images: PreparedImage[] = [];
    for (const image of converted.images) images.push(await downloadImage(image));

    prepared.push({
      id: crypto.randomUUID(),
      title: source.title.trim(),
      orderIndex: source.orderIndex,
      estimatedReadingTime: source.estimatedReadingTime,
      draftHtml: html,
      images,
      footnoteCount: converted.footnotes.length,
      calloutCount: converted.calloutCount,
      checklistItemCount: checklist?.items.length ?? 0,
    });
  }

  if (usedChecklists.size !== CHECKLISTS.length) {
    throw new Error("붙일 장을 찾지 못한 체크리스트가 있습니다.");
  }
  return prepared;
}

/**
 * 장 끝(각주 "주"보다 앞)에 체크리스트를 붙입니다. 각주는 본문을 위한 것이라
 * 끝에 두는 편이 읽기에 자연스럽습니다.
 */
function appendChecklist(html: string, items: { id: string; text: string }[]): string {
  const block =
    `<h2>${CHECKLIST_HEADING}</h2>\n<p>${escapeHtml(CHECKLIST_INTRO)}</p>\n` +
    `<section data-template-type="checklist" data-node-id="${generateNodeId()}"` +
    ` data-items="${escapeHtml(JSON.stringify(items))}"></section>`;
  const notesAt = html.lastIndexOf("<h3>주</h3>");
  return notesAt === -1
    ? `${html}\n${block}`
    : `${html.slice(0, notesAt)}${block}\n${html.slice(notesAt)}`;
}

async function downloadImage(image: ImageRef): Promise<PreparedImage> {
  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`이미지를 받지 못했습니다(${response.status}): ${image.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) throw new Error(`이미지 형식을 알 수 없습니다: ${image.url}`);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`이미지가 5MB를 넘습니다(${bytes.byteLength}B): ${image.url}`);
  }
  const fileName = `${image.ref}.${EXTENSION_BY_MIME.get(mime)}`;
  return { ...image, bytes, mime, fileName };
}

// ─── 검사 ─────────────────────────────────────────────────────────────────────

interface FinalHtml {
  html: string;
  wordCount: number;
  blockCount: number;
}

/**
 * 이미지 자리표시자를 바꾸고 sanitize한 뒤, 저장해도 되는 HTML인지 확인합니다.
 * 앱이 저장할 때 쓰는 것과 같은 함수들로 봅니다.
 */
function finalizeHtml(
  chapter: PreparedChapter,
  imageSrc: (image: PreparedImage) => string,
): FinalHtml {
  let html = chapter.draftHtml;
  for (const image of chapter.images) {
    html = html.replaceAll(escapeHtml(imagePlaceholder(image.ref)), escapeHtml(imageSrc(image)));
  }
  if (html.includes("sanity-image:")) throw new Error(`바꾸지 못한 이미지가 남았습니다: ${chapter.title}`);

  const sanitized = sanitizeContent(html);
  // sanitize가 글자를 지웠다면 허용 목록 밖의 무언가를 냈다는 뜻입니다.
  if (plainText(sanitized) !== plainText(html)) {
    throw new Error(`sanitize가 본문 글자를 바꿨습니다: ${chapter.title}`);
  }
  if ((sanitized.match(/<img /g) ?? []).length !== (html.match(/<img /g) ?? []).length) {
    throw new Error(`sanitize가 이미지를 지웠습니다: ${chapter.title}`);
  }
  if (isChapterHtmlTooLong(sanitized)) throw new Error(`장이 너무 깁니다: ${chapter.title}`);

  const blocks = extractWorkbookBlocks(sanitized);
  const expectedBlocks = chapter.calloutCount + (chapter.checklistItemCount > 0 ? 1 : 0);
  if (blocks.length !== expectedBlocks || countWorkbookBlockElements(sanitized) !== expectedBlocks) {
    throw new Error(
      `워크북 블록 수가 맞지 않습니다(${chapter.title}): 기대 ${expectedBlocks}, 추출 ${blocks.length}`,
    );
  }
  const checklistFields = blocks
    .filter((b) => b.block_type === "checklist")
    .reduce((sum, b) => sum + b.fields.length, 0);
  if (checklistFields !== chapter.checklistItemCount) {
    throw new Error(`체크리스트 항목 수가 맞지 않습니다(${chapter.title}): ${checklistFields}`);
  }

  return { html: sanitized, wordCount: countWords(sanitized), blockCount: blocks.length };
}

/** 태그를 걷고 엔티티를 푼 글자만. sanitize는 `&#39;`를 `'`로 다시 쓰는 등 표기만 바꿉니다. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, "");
}

function printSummary(chapters: PreparedChapter[], finals: FinalHtml[]) {
  console.log(`「${BOOK_TITLE}」 ${BOOK_PRICE.toLocaleString("ko-KR")}원, 장 ${chapters.length}개`);
  console.table(
    chapters.map((chapter, i) => ({
      장: chapter.title,
      단어: finals[i].wordCount,
      이미지: chapter.images.length,
      각주: chapter.footnoteCount,
      콜아웃: chapter.calloutCount,
      체크리스트항목: chapter.checklistItemCount,
      워크북블록: finals[i].blockCount,
    })),
  );
}

async function writePreview(
  outDir: string,
  guidebook: SanityGuidebook,
  chapters: PreparedChapter[],
  finals: FinalHtml[],
) {
  await mkdir(path.join(outDir, "images"), { recursive: true });
  for (const chapter of chapters) {
    for (const image of chapter.images) {
      await writeFile(path.join(outDir, "images", image.fileName), image.bytes);
    }
  }
  for (const [i, final] of finals.entries()) {
    await writeFile(path.join(outDir, `chapter-${i + 1}.html`), final.html);
  }
  const sections = chapters
    .map((chapter, i) => `<article><h1>${escapeHtml(chapter.title)}</h1>\n${finals[i].html}</article>`)
    .join("\n<hr>\n");
  // 워크북 블록은 리더 컴포넌트가 그리므로, 여기서는 data-* 내용을 글로 보여 줍니다.
  const page = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(BOOK_TITLE)} 미리보기</title>
<style>
body{max-width:680px;margin:40px auto;padding:0 16px;font:17px/1.8 sans-serif}
img{max-width:100%}
blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:16px;color:#444}
section[data-template-type]{border:1px solid #bbb;padding:12px 16px;margin:16px 0;white-space:pre-line}
section[data-template-type]::before{content:"[" attr(data-template-type) "] " attr(data-content) attr(data-items);font-size:14px}
</style>
<h1>${escapeHtml(BOOK_TITLE)}</h1><p>${escapeHtml(guidebook.description ?? "")}</p><hr>
${sections}`;
  await writeFile(path.join(outDir, "index.html"), page);
}

// ─── 옮기기 ───────────────────────────────────────────────────────────────────

async function importBook(guidebook: SanityGuidebook, chapters: PreparedChapter[]) {
  const supabase = await signIn();
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth.user?.id;
  if (!ownerId) throw new Error("로그인한 사용자를 확인하지 못했습니다.");

  const { data: existing, error: existingError } = await supabase
    .from("books")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("title", BOOK_TITLE);
  if (existingError) throw existingError;
  if (existing.length > 0) {
    throw new Error(`이 계정에 「${BOOK_TITLE}」이 이미 있습니다(${existing[0].id}). 다시 만들지 않습니다.`);
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      owner_id: ownerId,
      title: BOOK_TITLE,
      description: guidebook.description?.trim() || null,
      language: "ko",
      source_type: "markdown",
      price: BOOK_PRICE,
      status: "draft",
      visibility: "private",
    })
    .select("id")
    .single();
  if (bookError) throw bookError;
  console.log(`\n책을 만들었습니다: ${book.id}`);

  const uploaded: string[] = [];
  try {
    for (const [index, chapter] of chapters.entries()) {
      const urls = new Map<string, string>();
      for (const image of chapter.images) {
        const storagePath = `${book.id}/${chapter.id}/${nanoid(16)}.${EXTENSION_BY_MIME.get(image.mime)}`;
        const { error } = await supabase.storage
          .from(CHAPTER_IMAGES_BUCKET)
          .upload(storagePath, image.bytes, { contentType: image.mime, upsert: false });
        if (error) throw error;
        uploaded.push(storagePath);
        urls.set(image.ref, supabase.storage.from(CHAPTER_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl);
      }

      const final = finalizeHtml(chapter, (image) => urls.get(image.ref)!);
      // 상태를 주지 않아 published(기본값)로 들어갑니다. 책이 draft·private이라
      // 출간 전까지 독자에게 보이지 않습니다(`/api/upload`와 같습니다).
      const { error: chapterError } = await supabase.from("chapters").insert({
        id: chapter.id,
        book_id: book.id,
        title: chapter.title,
        slug: `chapter-${index + 1}-${Date.now()}-${index}`,
        order_index: index,
        content_html: final.html,
        word_count: final.wordCount,
        estimated_reading_time: chapter.estimatedReadingTime,
      });
      if (chapterError) throw chapterError;

      if (final.blockCount > 0) {
        const sync = await syncChapterWorkbookBlocks(supabase, chapter.id, final.html);
        if (!sync.ok) throw new Error(`블록 동기화 실패(${chapter.title}): ${sync.error}`);
        if (
          sync.stale ||
          sync.skipped > 0 ||
          sync.counts.conflicts.length > 0 ||
          sync.counts.blocks_upserted !== final.blockCount
        ) {
          throw new Error(`블록 동기화가 끝나지 않았습니다(${chapter.title}): ${JSON.stringify(sync)}`);
        }
      }
      console.log(`  ${index + 1}. ${chapter.title} — 이미지 ${chapter.images.length}, 블록 ${final.blockCount}`);
    }
  } catch (error) {
    console.error("\n옮기는 중에 실패해서 만든 책을 지웁니다.");
    // 파일은 책이 있을 때만 소유자 정책을 통과하므로 책보다 먼저 지웁니다.
    if (uploaded.length > 0) {
      const { error: removeError } = await supabase.storage.from(CHAPTER_IMAGES_BUCKET).remove(uploaded);
      if (removeError) console.error("이미지를 지우지 못했습니다", uploaded, removeError);
    }
    const { error: deleteError } = await supabase.from("books").delete().eq("id", book.id);
    if (deleteError) console.error(`책을 지우지 못했습니다(${book.id})`, deleteError);
    throw error;
  }

  console.log(`\n완료했습니다. 비공개 초안이니 편집 화면에서 확인한 뒤 공개해 주세요.`);
  console.log(`편집 화면: /create/edit/${book.id}`);
}

async function signIn(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.IMPORT_EMAIL;
  const password = process.env.IMPORT_PASSWORD;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY가 없습니다(--env-file=.env.local).");
  if (!email || !password) throw new Error("IMPORT_EMAIL / IMPORT_PASSWORD를 주세요.");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`로그인하지 못했습니다: ${error.message}`);
  return supabase;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
