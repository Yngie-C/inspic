import { SMART_GOAL_FIELDS, type WorkbookAnswer } from "./workbook/types";
import { parseChecklistItems } from "./workbook/extract-blocks";
import {
  calloutTypeOf,
  scaleRange,
  type CalloutType,
} from "./workbook/block-config";

/**
 * block_id → (field_key → 값).
 *
 * `groupAnswersByBlock()`이 돌려주는 모양 그대로입니다. 정의가 사라진
 * 문항의 값도 들어 있을 수 있는데, 여기서는 HTML에 남아 있는 문항만
 * 꺼내 쓰므로 자연히 무시됩니다. 그 값들을 살려 보여 주는 것은
 * 내보내기 쪽의 "고아 응답" 절이 맡습니다.
 */
export type FallbackAnswers = Record<string, Record<string, WorkbookAnswer>>;

export interface TemplateFallbackOptions {
  /** 독자가 쓴 답. 없으면 빈 워크시트가 나옵니다. */
  answers?: FallbackAnswers;
  /**
   * 이모지를 써도 되는가. 기본값 true.
   *
   * PDF는 false로 부르세요. 번들한 한글 폰트(Noto Sans KR)에 이모지
   * 글리프가 없어서, 그대로 두면 콜아웃 앞머리가 네모나 엉뚱한 글자로
   * 찍힙니다. EPUB은 리더기 폰트를 쓰므로 그대로 둡니다.
   */
  emoji?: boolean;
}

/**
 * 인터랙티브 워크북 블록을 EPUB/PDF용 정적 HTML로 바꿉니다.
 * `toXhtml()`이나 `stripHtmlForPdf()`보다 먼저 실행해야 합니다.
 *
 * `answers`를 주면 독자가 쓴 답이 제자리에 채워집니다. 답은 챕터 HTML이
 * 아니라 `workbook_responses`에 있으므로 호출하는 쪽이 실어 보내야 합니다.
 */
export function applyTemplateFallback(
  html: string,
  options: TemplateFallbackOptions = {},
): string {
  const { answers = {}, emoji = true } = options;

  return html.replace(TEMPLATE_SECTION, (match, attrs: string) => {
    const type = getAttr(attrs, "data-template-type");
    if (!type) return match;
    const blockId = getAttr(attrs, "data-node-id");
    return convertToFallback(type, attrs, match, answers[blockId] ?? {}, emoji);
  });
}

/**
 * `<section ...>…</section>`. 여는 태그의 속성은 따옴표 단위로 건넙니다.
 *
 * `[^>]*`로 훑으면 속성값 안의 `>`에서 태그가 끝난 것으로 봅니다.
 * sanitize는 속성값의 `>`를 이스케이프하지 않고 에디터는
 * `data-template-type`을 맨 뒤에 붙이므로, 질문·항목·라벨에 `>`가
 * 하나만 있어도 블록이 변환되지 않아 문항과 답이 통째로 빠졌습니다.
 */
const TEMPLATE_SECTION =
  /<section((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*>[\s\S]*?<\/section>/g;

/**
 * HTML 속성값을 읽습니다.
 *
 * 속성값 안의 따옴표는 `&quot;`로 이스케이프돼 있어서 JSON을 담은
 * 속성도 `[^"]*`로 잘라낼 수 있습니다. 대신 꺼낸 뒤에 엔티티를
 * 되돌려야 JSON.parse가 됩니다.
 */
function getAttr(attrs: string, attr: string): string {
  const matched = attrs.match(new RegExp(`(?:^|\\s)${attr}="([^"]*)"`));
  return matched ? decodeEntities(matched[1]) : "";
}

/** `&amp;`는 마지막에 풉니다. 먼저 풀면 `&amp;lt;`가 `<`까지 두 번 풀립니다. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&#(\d+);/g, (entity, code: string) => fromCodePoint(entity, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) =>
      fromCodePoint(entity, parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

function fromCodePoint(entity: string, code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 답을 쓰지 않은 자리. 인쇄해서 손으로 채우는 경우가 있어 빈 줄을 남깁니다.
 *
 * `&nbsp;`가 아니라 `&#160;`인 이유는 EPUB 장 파일이 DTD 없는 XHTML이라
 * 이름 엔티티가 정의되지 않은 엔티티(XML 오류)이기 때문입니다. 클래스는
 * PDF가 이 칸을 "빈 문단"과 구분해 쓸 자리로 그리는 표시입니다.
 */
export const BLANK_ANSWER_CLASS = "answer-blank";
const BLANK_ANSWER = `<p class="${BLANK_ANSWER_CLASS}">&#160;</p>`;

/**
 * 자유서술 답을 문단으로 바꿉니다.
 *
 * 줄바꿈을 `<br>`이 아니라 문단으로 나누는 이유는 `stripHtmlForPdf()`가
 * 공백을 접기 때문입니다. `<br>`로 두면 여러 줄로 쓴 답이 PDF에서 한 줄로
 * 이어 붙습니다. 답이 비어 있으면 빈 칸을 남깁니다 — 인쇄해서 손으로
 * 채우는 경우가 있습니다.
 */
function answerParagraphs(answer: WorkbookAnswer): string {
  if (typeof answer !== "string" || answer.trim() === "") {
    return BLANK_ANSWER;
  }

  return answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

/** 자유서술 답을 표 칸처럼 한 덩어리로. 줄바꿈은 공백으로 접습니다. */
function answerInline(answer: WorkbookAnswer): string {
  if (typeof answer !== "string" || answer.trim() === "") return "&#160;";
  return escapeHtml(answer.replace(/\s+/g, " ").trim());
}

const CALLOUT_PREFIX: Record<CalloutType, { emoji: string; text: string }> = {
  info: { emoji: "ℹ️", text: "[정보]" },
  warning: { emoji: "⚠️", text: "[주의]" },
  tip: { emoji: "💡", text: "[팁]" },
  note: { emoji: "📝", text: "[참고]" },
};

function convertToFallback(
  type: string,
  attrs: string,
  match: string,
  answers: Record<string, WorkbookAnswer>,
  emoji: boolean,
): string {
  switch (type) {
    case "checklist": {
      const items = parseChecklistItems(getAttr(attrs, "data-items"));
      if (items.length === 0) return "";
      // ☐/☑(U+2610/2611)이 아니라 □/✓를 쓰는 이유는 앞의 둘이 한글
      // 폰트에 없어서 PDF에서 네모로 찍히기 때문입니다.
      const listItems = items
        .map((item) => {
          const mark = answers[item.id] === true ? "✓" : "□";
          return `<li>${mark} ${escapeHtml(item.text)}</li>`;
        })
        .join("\n");
      return `<ul>\n${listItems}\n</ul>`;
    }

    case "callout": {
      // 콜아웃은 크리에이터가 쓴 안내문이라 독자가 채울 칸이 없습니다.
      const prefix = CALLOUT_PREFIX[calloutTypeOf(getAttr(attrs, "data-callout-type"))];
      const marker = emoji ? prefix.emoji : prefix.text;
      const text = getAttr(attrs, "data-content");
      return `<blockquote>${marker} ${escapeHtml(text)}</blockquote>`;
    }

    case "reflection": {
      const prompt = getAttr(attrs, "data-prompt");
      return `<p><strong>${escapeHtml(prompt)}</strong></p>\n${answerParagraphs(answers.answer)}`;
    }

    case "smart-goal": {
      const rows = SMART_GOAL_FIELDS.map(
        ({ key, label }) =>
          `<tr><td><strong>${key.toUpperCase()}</strong> ${escapeHtml(label)}</td><td>${answerInline(answers[key])}</td></tr>`,
      ).join("\n");
      return `<table>\n<tbody>\n${rows}\n</tbody>\n</table>`;
    }

    case "scale": {
      const { min, max } = scaleRange(
        getAttr(attrs, "data-min"),
        getAttr(attrs, "data-max"),
      );
      const labelMin = getAttr(attrs, "data-label-min");
      const labelMax = getAttr(attrs, "data-label-max");
      const minPart = labelMin ? `[${escapeHtml(labelMin)}] ` : "";
      const maxPart = labelMax ? ` [${escapeHtml(labelMax)}]` : "";
      const value = answers.value;
      const chosen =
        typeof value === "number" ? ` → <strong>${value}</strong>` : "";
      return `<p>척도: ${minPart}${min}-${max}${maxPart}${chosen}</p>`;
    }

    default:
      // 모르는 블록은 data-* 속성만 걷어내고 내용은 그대로 둡니다.
      // 여는 태그의 끝은 속성 뒤의 첫 `>`입니다(속성값 안의 `>`를 건너뜁니다).
      return `<div>${match.slice(match.indexOf(">", "<section".length + attrs.length) + 1, -"</section>".length)}</div>`;
  }
}
