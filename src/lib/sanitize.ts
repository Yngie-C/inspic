import DOMPurify from "isomorphic-dompurify";
import { isChapterImageUrl } from "./storage-image";

/**
 * 장 본문 sanitize. 저장(서버, 장 라우트·업로드)과 렌더(리더, 브라우저)가 같은
 * 함수를 씁니다 — 둘이 갈라지면 저장본과 렌더본이 달라집니다(코드 리뷰 12-P2-7).
 *
 * 허용 목록의 기준은 **에디터(`RichTextEditor`)와 업로드(marked·mammoth)가 실제로
 * 내는 태그·속성**입니다(12단계 공통 원인 1).
 * - 내는 것이 빠지면 저장할 때마다 조용히 사라집니다. 밑줄(`u`)·취소선(`s`)·
 *   형광펜(`mark`)·위 첨자(`sup`)는 에디터가, Markdown 취소선(`del`)·DOCX 아래
 *   첨자(`sub`)·병합한 표 칸(`colspan`·`rowspan`)은 업로드가 냅니다.
 * - 내지 않는 것을 열어 두면 막아 둔 공격을 한 칸 옆으로 돌아갑니다. 입력란
 *   (`textarea`·`label`)은 내는 곳이 없습니다 — 워크북 블록은 `section` + `data-*`이고
 *   답은 `workbook_responses`에 있습니다. 본문에 남은 입력란은 리더에서 살아 있는
 *   칸으로 그려지지만 어디에도 저장되지 않고, 카드 번호를 묻는 가짜 폼이 될 수
 *   있습니다(12-P1-2·12-P1-3).
 * - `input`만 받아서 글자로 바꿉니다. Markdown 할 일 목록(`- [ ] 할 일`)이 내는 체크
 *   상자는 `[ ]`/`[x]`가 되고, 나머지 `input`은 지웁니다. 체크 상자를 지우기만 하면
 *   이미 저장된 원고의 완료 표시까지 사라집니다.
 */
const ALLOWED_TAGS = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "em", "strong", "u", "s", "del", "mark", "sup", "sub",
  "ul", "ol", "li", "blockquote", "img", "a",
  "br", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "pre", "code", "span", "div", "figure", "figcaption",
  "section", "details", "summary", "input",
];

/**
 * `style`·`class`·`target`·`rel`·`src`·`colspan`·`rowspan`은 아래에서 값을 좁힌 뒤에만
 * 남습니다. `type`·`checked`는 체크 상자를 글자로 바꿀 때만 읽고 지웁니다.
 */
const ALLOWED_ATTR = [
  "href", "src", "alt", "class", "id", "open",
  "colspan", "rowspan",
  "style", "target", "rel",
  "type", "checked",
];

const FORBID_ATTR = [
  "onerror", "onload", "onclick", "onmouseover",
  "onfocus", "onblur", "onchange", "onsubmit",
  "onkeydown", "onkeyup", "onkeypress",
];

const TEXT_ALIGN = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i;

/** 코드 블록 언어 표시(`<code class="language-ts">`). 결정 1. */
const CODE_LANGUAGE_CLASS = /^language-[a-z0-9-]+$/;

/** 표 칸 병합 수. 브라우저도 1000에서 자르므로 세 자리면 충분합니다. */
const SPAN_COUNT = /^[1-9]\d{0,2}$/;

/**
 * DOMPurify가 걸러 낸 뒤의 DOM에서 남긴 속성의 값을 좁힙니다. 지우거나 줄이기만
 * 하고 새 마크업을 만들지 않으므로, 여기서 바꾼 것이 다시 위험해지지 않습니다.
 *
 * DOMPurify 훅을 쓰지 않는 이유(12-P2-6): isomorphic-dompurify는 앱 전체가 나눠
 * 쓰는 전역 인스턴스 하나를 주고, 서버에서는 전용 인스턴스를 만들 window를 내주지
 * 않습니다. 훅을 그 인스턴스에 걸면 다른 곳의 sanitize와 서로 섞입니다. jsdom을
 * 직접 불러 인스턴스를 만들면 Vercel의 require(esm) 문제(isomorphic-dompurify
 * 2.26.0 고정, PR #18)를 다시 밟습니다.
 */
function narrow(element: Element): void {
  const tag = element.tagName;

  if (tag === "INPUT") {
    // 대소문자를 가리지 않습니다 — 붙여 넣은 `type="CHECKBOX"`도 체크 상자입니다(12-P2-4).
    if (element.getAttribute("type")?.toLowerCase() === "checkbox") {
      const mark = element.hasAttribute("checked") ? "[x]" : "[ ]";
      element.replaceWith(element.ownerDocument.createTextNode(mark));
    } else {
      element.remove();
    }
    return;
  }
  element.removeAttribute("type");
  element.removeAttribute("checked");

  // `style`은 정렬(TextAlign 확장의 `text-align`) 하나만 남깁니다. 통째로 열면
  // `position: fixed`로 화면을 덮는 가짜 결제·로그인 안내를 심을 수 있습니다.
  const style = element.getAttribute("style");
  if (style !== null) {
    const align = TEXT_ALIGN.exec(style)?.[1]?.toLowerCase();
    if (align) element.setAttribute("style", `text-align: ${align}`);
    else element.removeAttribute("style");
  }

  // `class`는 코드 블록 언어 표시만 남깁니다. 번들에 있는 Tailwind 유틸
  // (`fixed inset-0 z-50`)만으로 `style`과 같은 오버레이를 만들 수 있습니다(12-P1-1).
  const className = element.getAttribute("class");
  if (className !== null && !(tag === "CODE" && CODE_LANGUAGE_CLASS.test(className))) {
    element.removeAttribute("class");
  }

  for (const name of ["colspan", "rowspan"]) {
    const value = element.getAttribute(name);
    if (value !== null && !((tag === "TD" || tag === "TH") && SPAN_COUNT.test(value))) {
      element.removeAttribute(name);
    }
  }

  // `target`·`rel`은 링크에만 둡니다. 새 탭(`_blank`)이면 `rel="noopener noreferrer"`를
  // 강제해서, 열린 페이지가 `window.opener`로 리더 탭을 다른 주소로 바꾸지 못하게 합니다.
  if (tag === "A") {
    element.removeAttribute("rel");
    if (element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.removeAttribute("target");
    }
  } else {
    element.removeAttribute("target");
    element.removeAttribute("rel");
  }

  // 이미지는 우리 `chapter-images`만 남기고, 아니면 대체 글을 글자로 남깁니다
  // (결정 2, 12-P2-1). 내보내기(`loadStorageImage()`)와 같은 판정입니다.
  if (tag === "IMG" && !isChapterImageUrl(element.getAttribute("src") ?? "")) {
    const alt = element.getAttribute("alt")?.trim();
    if (alt) element.replaceWith(element.ownerDocument.createTextNode(alt));
    else element.remove();
  }
}

/** 장 본문 HTML을 sanitize합니다. 서버(저장)와 브라우저(렌더) 모두 이 함수입니다. */
export function sanitizeContent(html: string): string {
  // RETURN_DOM은 걸러 낸 문서의 `<body>`를 돌려줍니다(타입은 `Node`).
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: true,
    RETURN_DOM: true,
  }) as HTMLElement;
  for (const element of Array.from(body.querySelectorAll("*"))) {
    narrow(element);
  }
  return body.innerHTML;
}

/**
 * 리더의 이중 방어 렌더링용 이름. 저장과 같은 함수입니다 — 정책이 다른 것처럼
 * 보이지만 하나이고, 한쪽만 고칠 수 없게 별칭으로 둡니다(12-P2-7).
 */
export const sanitizeForRender = sanitizeContent;
