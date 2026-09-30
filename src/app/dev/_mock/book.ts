import type { Book, Chapter } from "@/types";

/**
 * `/dev/*` 검증 페이지용 목 데이터. 실제 DB에 책이 없어도 핵심 루프 화면
 * (리더, 책 상세, 탐색)을 같은 컴포넌트로 그려 보기 위한 것이다.
 */

const NOW = "2026-09-30T00:00:00.000Z";

function items(list: Array<[string, string]>) {
  return JSON.stringify(list.map(([id, text]) => ({ id, text }))).replace(
    /"/g,
    "&quot;",
  );
}

const CH1_HTML = `
<p>이번 챕터는 단 하나의 목표를 가지고 있어요. <strong>지금 당장, 손으로 직접, 자소서 초안을 만들어보는 것.</strong></p>
<p>이론 설명은 없어요. 설치 이야기도 없어요. Claude Code를 열고, 5분 뒤엔 여러분의 이름이 들어간 자소서 초안이 파일로 저장되어 있을 거예요.</p>
<section data-template-type="checklist" data-node-id="dev-ck-1" data-items="${items([
  ["a", "터미널 열기"],
  ["b", "my-resume-pipeline 폴더 만들기"],
  ["c", "claude 실행하고 > 기호 확인하기"],
])}"></section>
<h2>Claude Code 시작하기</h2>
<p>터미널을 열어요. macOS라면 <code>Cmd + Space</code>를 눌러 Spotlight에서 “터미널”을 검색하고, 아래 명령어를 입력해요.</p>
<pre><code>mkdir my-resume-pipeline
cd my-resume-pipeline
claude</code></pre>
<p><code>mkdir</code>은 폴더를 만드는 명령어예요. <code>cd</code>는 그 폴더 안으로 들어가는 명령어고요. 마지막으로 <code>claude</code>를 치면 Claude Code가 시작돼요.</p>
<section data-template-type="callout" data-node-id="dev-co-1" data-callout-type="note" data-content="Claude Code가 설치되어 있어야 해요. Claude Pro 또는 Max 구독이 필요해요. 설치가 처음이라면 0장을 먼저 확인하세요."></section>
<section data-template-type="scale" data-node-id="dev-sc-1" data-min="1" data-max="10" data-label-min="전혀 없음" data-label-max="매우 자신 있음"></section>
<h2>자소서 초안 요청하기</h2>
<p><code>&gt;</code> 뒤에 프롬프트를 입력하면 돼요. 예시를 그대로 복사해도 되지만, 괄호 안의 내용은 본인 정보로 꼭 바꿔주세요.</p>
<ul><li>지원 회사와 직무</li><li>강조하고 싶은 경험 두 가지</li></ul>
<section data-template-type="reflection" data-node-id="dev-rf-1" data-prompt="내가 지원하려는 직무를 한 문장으로 적어 보세요." data-placeholder="예: 테크코프 백엔드 개발자, 대용량 트래픽을 다루는 팀"></section>
<section data-template-type="callout" data-node-id="dev-co-2" data-callout-type="warning" data-content="회사 이름이나 실제 개인정보를 공개 저장소에 올리지 마세요."></section>
<section data-template-type="callout" data-node-id="dev-co-3" data-callout-type="tip" data-content="초안이 마음에 들지 않으면 '더 짧게', '숫자를 넣어서'처럼 한 가지씩만 고쳐 달라고 요청하세요."></section>
<section data-template-type="smart-goal" data-node-id="dev-sg-1"></section>
<blockquote>좋은 자소서는 한 번에 써지지 않는다. 고칠 수 있는 초안이 먼저다.</blockquote>
`;

export const DEV_CHAPTER_TITLES = [
  "준비: 클로드 코드 설치하기",
  "첫 자소서 초안, 5분 만에 만들기",
  "클로드 코드, 이것만 알면 된다",
  "JD 수집과 정리: 첫 번째 스킬 만들기",
  "맞춤형 자소서 생성",
  "자소서 검토와 개선",
  "PDF 내보내기와 파이프라인 완성",
];

export const DEV_BOOK: Book = {
  id: "dev-book-1",
  owner_id: "dev-owner",
  title: "클로드 코드로 만드는 나만의 자소서 파이프라인",
  description:
    "채용 공고를 분석하는 스킬부터 PDF 내보내기까지, 한 번 만들어 두면 수십 개 회사에 일괄 적용할 수 있는 나만의 자소서 파이프라인을 직접 구축해요.",
  cover_image_url: null,
  language: "ko",
  status: "published",
  visibility: "public",
  source_type: "markdown",
  source_file_url: null,
  total_chapters: DEV_CHAPTER_TITLES.length,
  total_words: 24000,
  published_at: NOW,
  price: 12000,
  is_free: false,
  created_at: NOW,
  updated_at: NOW,
};

export const DEV_CHAPTERS: Chapter[] = DEV_CHAPTER_TITLES.map((title, i) => ({
  id: `dev-ch-${i}`,
  book_id: DEV_BOOK.id,
  title,
  slug: `chapter-${i}`,
  order_index: i,
  content_html:
    i === 1 ? CH1_HTML : `<p>${title} 본문 자리입니다. 검증은 두 번째 장에서 합니다.</p>`,
  content_raw: null,
  word_count: 3000,
  estimated_reading_time: 15,
  status: "published",
  published_at: NOW,
  created_at: NOW,
  updated_at: NOW,
}));

const OTHER_TITLES: Array<[string, number]> = [
  ["대화만으로 만드는 나만의 포트폴리오 사이트", 9000],
  ["하루 10분 회고 워크북", 0],
  ["첫 팀장을 위한 1:1 미팅 플레이북", 15000],
  ["돈 모으는 습관 30일 챌린지", 0],
  ["데이터로 말하는 기획자의 SQL 입문", 18000],
  ["퇴근 후 1시간, 사이드 프로젝트 설계법", 11000],
];

/** 탐색 그리드와 "이 저자의 다른 책"용. 표지 톤이 섞이도록 id를 다르게 둔다. */
export const DEV_BOOKS = [
  { ...DEV_BOOK, author_name: "inspic" },
  ...OTHER_TITLES.map(([title, price], i) => ({
    ...DEV_BOOK,
    id: `dev-book-${i + 2}`,
    title,
    price,
    is_free: price === 0,
    author_name: i % 2 === 0 ? "inspic" : "김서연",
  })),
];
