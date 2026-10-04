// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import { createRequire } from "node:module";
import { applyTemplateFallback } from "./template-fallback";
import { MISSING_CHAPTER_NOTE, MISSING_CHAPTER_TITLE } from "./pdf-generator";

// fontkit은 CommonJS라 ESM 기본 임포트로는 undefined가 옵니다.
const fontkit = createRequire(import.meta.url)("fontkit") as {
  openSync: (file: string) => { characterSet: number[] };
};

/**
 * PDF에 찍힐 글자가 번들한 폰트에 실제로 있는지.
 *
 * 없는 글자는 예외를 내지 않습니다. 조용히 다른 폰트로 새어 엉뚱한
 * 문자로 찍히고, 그건 PDF를 열어 보기 전에는 아무도 모릅니다. 실제로
 * ✓(U+2713)가 Dingbats 블록이라는 것을 놓쳐서, 체크한 항목이 PDF에
 * 'v'로 나온 적이 있습니다.
 *
 * 문자를 손으로 나열하지 않고 폴백이 만든 HTML에서 뽑는 이유는,
 * 나중에 블록을 추가하거나 기호를 바꿔도 이 테스트가 따라오게 하기
 * 위해서입니다.
 */

const FONT_FILES = [
  "NotoSansKR-Regular.subset.ttf",
  "NotoSansKR-Bold.subset.ttf",
];

function loadCharacterSet(file: string): Set<number> {
  const font = fontkit.openSync(
    path.join(process.cwd(), "public", "fonts", file),
  );
  return new Set(font.characterSet);
}

function section(attrs: Record<string, string>): string {
  const rendered = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<section ${rendered}></section>`;
}

/** 다섯 블록 전부 + 답이 있는 경우와 없는 경우. */
const ALL_BLOCKS = [
  section({
    "data-template-type": "checklist",
    "data-node-id": "k",
    "data-items": JSON.stringify([{ id: "i1", text: "항목" }]),
  }),
  section({
    "data-template-type": "reflection",
    "data-node-id": "r",
    "data-prompt": "질문",
  }),
  section({
    "data-template-type": "scale",
    "data-node-id": "s",
    "data-min": "1",
    "data-max": "10",
  }),
  section({ "data-template-type": "smart-goal", "data-node-id": "g" }),
  ...["info", "warning", "tip", "note"].map((type) =>
    section({
      "data-template-type": "callout",
      "data-node-id": `c-${type}`,
      "data-callout-type": type,
      "data-content": "안내",
    }),
  ),
].join("\n");

/** PDF 렌더러가 직접 찍는 고정 문구. 폴백 HTML에는 없습니다. */
const PDF_LITERALS = [
  "목차 (Table of Contents)",
  "(내용 없음)",
  "Cover",
  "•",
  "저자가 이후 수정한 문항의 답",
  "아래 답을 받던 문항은 저자가 책을 고치면서 사라졌어요. 질문 문구는 남아 있지 않지만 쓰신 내용은 그대로예요.",
  MISSING_CHAPTER_TITLE,
  MISSING_CHAPTER_NOTE,
].join("");

function charactersUsedByPdf(): string {
  const filled = applyTemplateFallback(ALL_BLOCKS, {
    emoji: false,
    answers: { k: { i1: true }, s: { value: 7 } },
  });
  const empty = applyTemplateFallback(ALL_BLOCKS, { emoji: false });

  // 태그와 엔티티는 PDF에 찍히지 않습니다.
  return (filled + empty + PDF_LITERALS)
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "");
}

describe.each(FONT_FILES)("%s", (file) => {
  const characterSet = loadCharacterSet(file);

  it("PDF 폴백이 쓰는 글자를 전부 담고 있다", () => {
    const missing = [
      ...new Set(
        [...charactersUsedByPdf()].filter(
          (char) => !/\s/.test(char) && !characterSet.has(char.codePointAt(0)!),
        ),
      ),
    ].map((char) => `${char} (U+${char.codePointAt(0)!.toString(16).toUpperCase()})`);

    expect(missing).toEqual([]);
  });

  it("한글 음절 전체를 담고 있다", () => {
    // 독자가 자유서술에 무슨 글자를 쓸지 모릅니다. 빠진 음절은 네모로
    // 찍히고, 하필 그런 글자를 쓴 사람만 겪습니다.
    const missing: string[] = [];
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
      if (!characterSet.has(cp)) missing.push(String.fromCodePoint(cp));
    }

    expect(missing).toEqual([]);
  });
});
