/**
 * Sanity Portable Text(s-growthlab `guidebookChapter.body`)를 장 HTML로 바꿉니다.
 *
 * 내는 HTML은 에디터(Tiptap)가 다시 열어도 그대로 살아남는 것만 씁니다. 저자가
 * 옮긴 뒤 편집 화면에서 장을 한 번 저장하면 에디터가 모르는 태그·속성은 사라지기
 * 때문입니다. 그래서 `<figure>`·`<sup>`·앵커 id를 쓰지 않습니다.
 *
 * 모르는 블록·스타일·표시를 만나면 던집니다. 조용히 버리면 원고 일부가 빠진 채
 * 옮겨지고, 그것을 알아챌 사람이 없습니다.
 */
import { CALLOUT_TYPES } from "../../src/lib/workbook/block-config";

export interface PtSpan {
  _type: "span";
  text: string;
  marks?: string[];
}

export interface PtMarkDef {
  _key: string;
  _type: string;
  number?: number;
  text?: string;
  href?: string;
}

export interface PtBlock {
  _type: "block";
  style?: string;
  listItem?: string;
  level?: number;
  children: PtSpan[];
  markDefs?: PtMarkDef[];
}

export interface PtImage {
  _type: "image";
  asset: { _ref: string };
  alt?: string;
  caption?: string;
}

export interface PtImageGrid {
  _type: "imageGrid";
  images: PtImage[];
}

export interface PtCallout {
  _type: "callout";
  type?: string;
  content: string;
}

export type PtNode = PtBlock | PtImage | PtImageGrid | PtCallout | { _type: string };

export interface ImageRef {
  /** Sanity 에셋 ref. 같은 장 HTML 안의 `src` 자리표시자로도 씁니다. */
  ref: string;
  url: string;
}

export interface Footnote {
  number: number;
  text: string;
}

export interface ConvertedChapter {
  html: string;
  images: ImageRef[];
  footnotes: Footnote[];
  calloutCount: number;
}

const BLOCK_TAG = new Map([
  ["normal", "p"],
  ["h2", "h2"],
  ["h3", "h3"],
  ["h4", "h4"],
]);

const DECORATOR_TAG = new Map([
  ["strong", "strong"],
  ["em", "em"],
  ["underline", "u"],
  ["highlight", "mark"],
  ["strike-through", "s"],
  ["code", "code"],
]);

const LIST_TAG = new Map([
  ["bullet", "ul"],
  ["number", "ol"],
]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 줄바꿈은 `<br>`로 둡니다(에디터의 HardBreak). */
function escapeText(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/**
 * `image-<hash>-<w>x<h>-<ext>` → Sanity CDN 원본 URL.
 */
export function sanityImageUrl(ref: string, projectId: string, dataset: string): string {
  const match = /^image-([0-9a-f]+-\d+x\d+)-(\w+)$/.exec(ref);
  if (!match) throw new Error(`이미지 ref를 읽을 수 없습니다: ${ref}`);
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${match[1]}.${match[2]}`;
}

/** 본문 `src`에 들어가는 자리표시자. 올린 뒤 실제 URL로 바꿉니다. */
export function imagePlaceholder(ref: string): string {
  return `sanity-image:${ref}`;
}

export interface ConvertOptions {
  projectId: string;
  dataset: string;
  /** callout 블록의 data-node-id. 테스트에서 고정하려고 받습니다. */
  newBlockId: () => string;
}

export function convertChapterBody(
  body: readonly PtNode[],
  options: ConvertOptions,
): ConvertedChapter {
  const out: string[] = [];
  const images: ImageRef[] = [];
  const footnotes: Footnote[] = [];
  let calloutCount = 0;

  // 열린 목록. 같은 종류·같은 깊이의 목록 항목이 이어지면 한 목록에 넣습니다.
  const openLists: string[] = [];
  const closeListsTo = (depth: number) => {
    while (openLists.length > depth) out.push(`</li></${openLists.pop()}>`);
  };

  const pushImage = (image: PtImage) => {
    const url = sanityImageUrl(image.asset._ref, options.projectId, options.dataset);
    if (!images.some((i) => i.ref === image.asset._ref)) {
      images.push({ ref: image.asset._ref, url });
    }
    const caption = image.caption?.trim();
    const alt = image.alt?.trim() || caption || "";
    out.push(
      `<img src="${escapeHtml(imagePlaceholder(image.asset._ref))}" alt="${escapeHtml(alt)}">`,
    );
    if (caption) out.push(`<p><em>${escapeText(caption)}</em></p>`);
  };

  for (const node of body) {
    if (node._type === "block") {
      const block = node as PtBlock;
      const inline = renderSpans(block, footnotes);

      if (block.listItem) {
        const listTag = LIST_TAG.get(block.listItem);
        if (!listTag) throw new Error(`모르는 목록 종류: ${block.listItem}`);
        if ((block.style ?? "normal") !== "normal") {
          throw new Error(`목록 항목의 스타일은 normal이어야 합니다: ${block.style}`);
        }
        const depth = block.level ?? 1;
        if (openLists.length >= depth) {
          closeListsTo(depth);
          if (openLists[depth - 1] !== listTag) {
            closeListsTo(depth - 1);
          } else {
            out.push("</li>");
          }
        }
        while (openLists.length < depth) {
          // 한 단계씩만 깊어집니다. 건너뛰면 빈 항목이 생깁니다.
          if (openLists.length < depth - 1) {
            throw new Error(`목록 깊이가 건너뛰었습니다: ${openLists.length} → ${depth}`);
          }
          out.push(`<${listTag}>`);
          openLists.push(listTag);
        }
        out.push(`<li><p>${inline}</p>`);
        continue;
      }

      closeListsTo(0);
      const style = block.style ?? "normal";
      if (style === "blockquote") {
        out.push(`<blockquote><p>${inline}</p></blockquote>`);
        continue;
      }
      const tag = BLOCK_TAG.get(style);
      if (!tag) throw new Error(`모르는 블록 스타일: ${style}`);
      // 빈 단락은 원고의 간격용이라 옮기지 않습니다.
      if (tag === "p" && inline.trim() === "") continue;
      out.push(`<${tag}>${inline}</${tag}>`);
      continue;
    }

    closeListsTo(0);

    if (node._type === "image") {
      pushImage(node as PtImage);
    } else if (node._type === "imageGrid") {
      for (const image of (node as PtImageGrid).images) pushImage(image);
    } else if (node._type === "callout") {
      const callout = node as PtCallout;
      const type = callout.type ?? "note";
      if (!(CALLOUT_TYPES as readonly string[]).includes(type)) {
        throw new Error(`모르는 callout 종류: ${type}`);
      }
      calloutCount += 1;
      out.push(
        `<section data-template-type="callout" data-node-id="${options.newBlockId()}"` +
          ` data-callout-type="${type}" data-content="${escapeHtml(callout.content.trim())}"></section>`,
      );
    } else {
      throw new Error(`모르는 본문 블록: ${node._type}`);
    }
  }
  closeListsTo(0);

  if (footnotes.length > 0) {
    out.push("<h3>주</h3>");
    for (const note of footnotes) {
      out.push(`<p>[${note.number}] ${escapeText(note.text.trim())}</p>`);
    }
  }

  return { html: out.join("\n"), images, footnotes, calloutCount };
}

/**
 * 한 블록의 span들을 인라인 HTML로 만듭니다.
 *
 * 각주는 원본 리더처럼 표시된 글자 바로 뒤에 번호를 둡니다. `<sup>`는 sanitize가
 * 지우므로 `[n]` 텍스트로 남기고, 본문은 장 끝 "주"에 모읍니다.
 */
function renderSpans(block: PtBlock, footnotes: Footnote[]): string {
  const defs = new Map((block.markDefs ?? []).map((d) => [d._key, d]));
  let html = "";

  block.children.forEach((span, index) => {
    if (span._type !== "span") throw new Error(`모르는 인라인 요소: ${span._type}`);
    let text = escapeText(span.text);
    const marks = span.marks ?? [];
    const nextMarks = block.children[index + 1]?.marks ?? [];
    const notes: Footnote[] = [];
    let href: string | null = null;

    for (const mark of marks) {
      const decorator = DECORATOR_TAG.get(mark);
      if (decorator) continue;
      const def = defs.get(mark);
      if (!def) throw new Error(`정의가 없는 표시: ${mark}`);
      if (def._type === "footnote") {
        if (typeof def.number !== "number" || typeof def.text !== "string") {
          throw new Error(`번호나 본문이 없는 각주: ${def._key}`);
        }
        // 각주가 여러 span에 걸쳐 있으면 마지막 span 뒤에 번호를 붙입니다.
        if (!nextMarks.includes(mark)) notes.push({ number: def.number, text: def.text });
      } else if (def._type === "link") {
        if (!def.href || !/^(https?:|mailto:|tel:)/.test(def.href)) {
          throw new Error(`쓸 수 없는 링크: ${def.href}`);
        }
        href = def.href;
      } else {
        throw new Error(`모르는 주석 종류: ${def._type}`);
      }
    }

    // 꾸밈은 span 하나씩 닫습니다. 이웃 span과 합치지 않아도 에디터가 다시 합칩니다.
    for (const mark of marks) {
      const tag = DECORATOR_TAG.get(mark);
      if (tag) text = `<${tag}>${text}</${tag}>`;
    }
    if (href) {
      text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    html += text;

    for (const note of notes) {
      if (footnotes.some((f) => f.number === note.number)) {
        throw new Error(`같은 번호의 각주가 두 번 나옵니다: ${note.number}`);
      }
      footnotes.push(note);
      html += `[${note.number}]`;
    }
  });
  return html;
}
