import { SMART_GOAL_FIELDS, type WorkbookAnswer } from "./workbook/types";
import { parseChecklistItems } from "./workbook/extract-blocks";

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

  return html.replace(
    /<section\s+[^>]*data-template-type="([^"]*)"[^>]*>[\s\S]*?<\/section>/g,
    (match, type: string) => {
      const blockId = getAttr(match, "data-node-id");
      return convertToFallback(type, match, answers[blockId] ?? {}, emoji);
    },
  );
}

/**
 * HTML 속성값을 읽습니다.
 *
 * 속성값 안의 따옴표는 `&quot;`로 이스케이프돼 있어서 JSON을 담은
 * 속성도 `[^"]*`로 잘라낼 수 있습니다. 대신 꺼낸 뒤에 엔티티를
 * 되돌려야 JSON.parse가 됩니다.
 */
function getAttr(html: string, attr: string): string {
  const matched = html.match(new RegExp(`${attr}="([^"]*)"`));
  return matched ? decodeEntities(matched[1]) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
    return "<p>&nbsp;</p>";
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
  if (typeof answer !== "string" || answer.trim() === "") return "&nbsp;";
  return escapeHtml(answer.replace(/\s+/g, " ").trim());
}

const CALLOUT_PREFIX: Record<string, { emoji: string; text: string }> = {
  info: { emoji: "ℹ️", text: "[정보]" },
  warning: { emoji: "⚠️", text: "[주의]" },
  tip: { emoji: "💡", text: "[팁]" },
  note: { emoji: "📝", text: "[메모]" },
};

function convertToFallback(
  type: string,
  match: string,
  answers: Record<string, WorkbookAnswer>,
  emoji: boolean,
): string {
  switch (type) {
    case "checklist": {
      const items = parseChecklistItems(getAttr(match, "data-items"));
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
      const calloutType = getAttr(match, "data-callout-type") || "note";
      const prefix = CALLOUT_PREFIX[calloutType] ?? CALLOUT_PREFIX.note;
      const marker = emoji ? prefix.emoji : prefix.text;
      const text = getAttr(match, "data-content");
      return `<blockquote>${marker} ${escapeHtml(text)}</blockquote>`;
    }

    case "reflection": {
      const prompt = getAttr(match, "data-prompt");
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
      const min = getAttr(match, "data-min") || "1";
      const max = getAttr(match, "data-max") || "10";
      const labelMin = getAttr(match, "data-label-min");
      const labelMax = getAttr(match, "data-label-max");
      const minPart = labelMin ? `[${escapeHtml(labelMin)}] ` : "";
      const maxPart = labelMax ? ` [${escapeHtml(labelMax)}]` : "";
      const value = answers.value;
      const chosen =
        typeof value === "number" ? ` → <strong>${value}</strong>` : "";
      return `<p>스케일: ${minPart}${min}-${max}${maxPart}${chosen}</p>`;
    }

    default:
      // 모르는 블록은 data-* 속성만 걷어내고 내용은 그대로 둡니다.
      return match
        .replace(/<section\s+[^>]*>/, "<div>")
        .replace(/<\/section>$/, "</div>");
  }
}
