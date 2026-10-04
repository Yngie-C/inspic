import DOMPurify, { type UponSanitizeAttributeHook } from "isomorphic-dompurify";

/**
 * 에디터(`RichTextEditor`)가 내는 서식은 전부 여기를 통과해야 저장됩니다.
 * 밑줄(`u`)·취소선(`s`)·형광펜(`mark`)이 빠져 있으면 저장할 때마다
 * 조용히 사라집니다.
 */
const ALLOWED_TAGS = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "em", "strong", "u", "s", "mark",
  "ul", "ol", "li", "blockquote", "img", "a",
  "br", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "pre", "code", "span", "div", "figure", "figcaption",
  "section", "details", "summary", "input", "label", "textarea",
];

/** `style`·`target`·`rel`은 아래 훅이 값을 좁힌 뒤에만 남습니다. */
const ALLOWED_ATTR = [
  "href", "src", "alt", "class", "id",
  "type", "name", "for", "open", "min", "max", "value", "placeholder",
  "rows", "cols", "readonly", "disabled",
  "style", "target", "rel",
];

const FORBID_ATTR = [
  "onerror", "onload", "onclick", "onmouseover",
  "onfocus", "onblur", "onchange", "onsubmit",
  "onkeydown", "onkeyup", "onkeypress",
];

const TEXT_ALIGN = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i;

/**
 * `style`은 정렬(TextAlign 확장의 `text-align`) 하나만 남깁니다.
 *
 * `style`을 통째로 열면 `position: fixed`로 화면을 덮는 가짜 결제·로그인
 * 안내를 본문에 심을 수 있습니다.
 */
const keepOnlyTextAlign: UponSanitizeAttributeHook = (_node, data) => {
  if (data.attrName !== "style") return;
  const align = TEXT_ALIGN.exec(data.attrValue)?.[1]?.toLowerCase();
  if (align) {
    data.attrValue = `text-align: ${align}`;
  } else {
    data.keepAttr = false;
  }
};

/**
 * - checkbox가 아닌 `input`은 지웁니다 — 비밀번호·카드번호 입력란을 본문에 심지 못하게.
 * - `target`·`rel`은 링크에만 둡니다. 새 탭(`_blank`)이면 `rel="noopener noreferrer"`를
 *   강제해서, 열린 페이지가 `window.opener`로 리더 탭을 다른 주소로 바꾸지 못하게 합니다.
 */
const restrictElements = (node: Element) => {
  if (node.tagName === "INPUT" && node.getAttribute("type") !== "checkbox") {
    node.remove();
    return;
  }

  if (node.tagName !== "A") {
    node.removeAttribute("target");
    node.removeAttribute("rel");
    return;
  }

  node.removeAttribute("rel");
  if (node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  } else {
    node.removeAttribute("target");
  }
};

/**
 * DOMPurify 인스턴스는 전역 하나를 앱 전체가 나눠 씁니다(isomorphic-dompurify가
 * `global.DOMPurify`에 둡니다). 훅을 import 시점에 걸어 두면 다른 곳의 sanitize에도
 * 걸리므로, 이 호출 동안에만 걸었다가 뗍니다. sanitize는 동기라 그 사이에 다른
 * 호출이 끼지 않습니다.
 */
function sanitize(html: string): string {
  DOMPurify.addHook("uponSanitizeAttribute", keepOnlyTextAlign);
  DOMPurify.addHook("afterSanitizeAttributes", restrictElements);
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_ATTR,
      ALLOW_DATA_ATTR: true,
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", keepOnlyTextAlign);
    DOMPurify.removeHook("afterSanitizeAttributes", restrictElements);
  }
}

/** 서버 사이드: 챕터 저장 시 강제 sanitize */
export function sanitizeContent(html: string): string {
  return sanitize(html);
}

/** 클라이언트 사이드: 이중 방어 렌더링용 */
export function sanitizeForRender(html: string): string {
  return sanitize(html);
}
