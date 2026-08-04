import { SMART_GOAL_FIELDS } from "./workbook/types";
import { parseChecklistItems } from "./workbook/extract-blocks";

/**
 * 인터랙티브 워크북 블록을 EPUB/PDF용 정적 HTML로 바꿉니다.
 * `toXhtml()`이나 `stripHtmlForPdf()`보다 먼저 실행해야 합니다.
 *
 * 결과는 빈 워크시트입니다. 독자가 쓴 내용은 챕터 HTML이 아니라
 * `workbook_responses`에 있으므로 여기서는 나오지 않습니다.
 * (응답까지 담는 내보내기는 M5에서 다룹니다.)
 */
export function applyTemplateFallback(html: string): string {
  return html.replace(
    /<section\s+[^>]*data-template-type="([^"]*)"[^>]*>[\s\S]*?<\/section>/g,
    (match, type: string) => convertToFallback(type, match),
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

function convertToFallback(type: string, match: string): string {
  switch (type) {
    case "checklist": {
      const items = parseChecklistItems(getAttr(match, "data-items"));
      if (items.length === 0) return "";
      const listItems = items
        .map((item) => `<li>☐ ${escapeHtml(item.text)}</li>`)
        .join("\n");
      return `<ul>\n${listItems}\n</ul>`;
    }

    case "callout": {
      const calloutType = getAttr(match, "data-callout-type") || "note";
      const prefixMap: Record<string, string> = {
        info: "ℹ️",
        warning: "⚠️",
        tip: "💡",
        note: "📝",
      };
      const prefix = prefixMap[calloutType] || "📝";
      const text = getAttr(match, "data-content");
      return `<blockquote>${prefix} ${escapeHtml(text)}</blockquote>`;
    }

    case "reflection": {
      const prompt = getAttr(match, "data-prompt");
      return `<p><strong>${escapeHtml(prompt)}</strong></p>\n<p>&nbsp;</p>`;
    }

    case "smart-goal": {
      const rows = SMART_GOAL_FIELDS.map(
        ({ key, label }) =>
          `<tr><td><strong>${key.toUpperCase()}</strong> ${escapeHtml(label)}</td><td>&nbsp;</td></tr>`,
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
      return `<p>스케일: ${minPart}${min}-${max}${maxPart}</p>`;
    }

    default:
      // 모르는 블록은 data-* 속성만 걷어내고 내용은 그대로 둡니다.
      return match
        .replace(/<section\s+[^>]*>/, "<div>")
        .replace(/<\/section>$/, "</div>");
  }
}
