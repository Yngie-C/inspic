import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Book, Chapter } from "@/types";
import { applyTemplateFallback, type FallbackAnswers } from "./template-fallback";
import { PDF_FONT_FAMILY, registerPdfFonts } from "./pdf-fonts";

// 한글 글리프가 있는 폰트를 등록합니다. 내장 Helvetica로는 렌더가
// 성공한 채 한글만 깨지므로, 이 호출이 빠지면 조용히 망가집니다.
registerPdfFonts();

// 인쇄물 색. DESIGN.md 팔레트의 잉크·회색·Stone 선만 쓰고 Coral은 쓰지 않습니다.
const PDF_COLORS = {
  ink: "#000000",
  muted: "#5E5A54",
  faint: "#736E67",
  line: "#E4DED2",
  lineStrong: "#C9C1B2",
  codeBg: "#F6F4F1",
  page: "#FFFFFF",
} as const;

// 이 문서에는 이탤릭 웨이트가 없습니다. fontStyle: "italic"을 주면
// react-pdf가 해당 스타일의 소스를 못 찾아 렌더 자체가 실패합니다.
// 강조는 색과 선으로만 합니다.
const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
    lineHeight: 1.6,
    color: PDF_COLORS.ink,
  },
  coverPage: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 11,
    paddingTop: 120,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
    backgroundColor: PDF_COLORS.page,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    textAlign: "center",
    color: PDF_COLORS.ink,
    marginBottom: 24,
    lineHeight: 1.3,
  },
  coverAuthor: {
    fontSize: 16,
    fontFamily: PDF_FONT_FAMILY,
    textAlign: "center",
    color: PDF_COLORS.muted,
    marginBottom: 40,
  },
  coverDivider: {
    width: 60,
    height: 2,
    backgroundColor: PDF_COLORS.lineStrong,
    marginBottom: 32,
  },
  coverDescription: {
    fontSize: 12,
    fontFamily: PDF_FONT_FAMILY,
    textAlign: "center",
    color: PDF_COLORS.muted,
    lineHeight: 1.6,
    maxWidth: 360,
  },
  tocPage: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
  },
  tocTitle: {
    fontSize: 20,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.ink,
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.line,
    paddingBottom: 12,
  },
  tocItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingVertical: 4,
  },
  tocItemTitle: {
    fontSize: 11,
    color: PDF_COLORS.ink,
    flex: 1,
    paddingRight: 8,
  },
  tocItemDots: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomStyle: "dotted",
    borderBottomColor: PDF_COLORS.lineStrong,
    marginBottom: 3,
    marginHorizontal: 8,
  },
  tocItemPage: {
    fontSize: 11,
    color: PDF_COLORS.faint,
    width: 30,
    textAlign: "right",
  },
  chapterPage: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    lineHeight: 1.6,
    color: PDF_COLORS.ink,
  },
  chapterTitle: {
    fontSize: 22,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.ink,
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.line,
    paddingBottom: 16,
    lineHeight: 1.3,
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 14,
    lineHeight: 1.7,
    textAlign: "justify",
    color: PDF_COLORS.ink,
  },
  heading1: {
    fontSize: 18,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.ink,
    marginTop: 24,
    marginBottom: 12,
    lineHeight: 1.3,
  },
  heading2: {
    fontSize: 15,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.ink,
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 1.3,
  },
  heading3: {
    fontSize: 12,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.ink,
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  blockquote: {
    fontSize: 11,
    color: PDF_COLORS.muted,
    fontFamily: PDF_FONT_FAMILY,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.lineStrong,
    paddingLeft: 16,
    marginBottom: 14,
    marginVertical: 8,
    lineHeight: 1.7,
  },
  codeBlock: {
    fontSize: 10,
    fontFamily: PDF_FONT_FAMILY,
    backgroundColor: PDF_COLORS.codeBg,
    padding: 12,
    marginBottom: 14,
    lineHeight: 1.5,
    color: PDF_COLORS.ink,
  },
  listItem: {
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 1.7,
    color: PDF_COLORS.ink,
    flexDirection: "row",
  },
  listBullet: {
    width: 16,
    fontSize: 11,
    color: PDF_COLORS.muted,
  },
  listContent: {
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.line,
    paddingBottom: 6,
  },
  tableLabel: {
    fontSize: 10,
    color: PDF_COLORS.muted,
    width: "42%",
    paddingRight: 10,
    lineHeight: 1.5,
  },
  tableValue: {
    fontSize: 11,
    color: PDF_COLORS.ink,
    flex: 1,
    lineHeight: 1.6,
  },
  orphanSection: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.line,
    paddingTop: 14,
  },
  orphanTitle: {
    fontSize: 12,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: "bold",
    color: PDF_COLORS.muted,
    marginBottom: 6,
  },
  orphanNote: {
    fontSize: 9,
    color: PDF_COLORS.faint,
    marginBottom: 12,
    lineHeight: 1.6,
  },
  orphanAnswer: {
    fontSize: 11,
    color: PDF_COLORS.ink,
    marginBottom: 10,
    lineHeight: 1.7,
    borderLeftWidth: 2,
    borderLeftColor: PDF_COLORS.lineStrong,
    paddingLeft: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 72,
    right: 72,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.line,
    paddingTop: 8,
  },
  footerTitle: {
    fontSize: 9,
    color: PDF_COLORS.faint,
    flex: 1,
  },
  footerPage: {
    fontSize: 9,
    color: PDF_COLORS.faint,
    textAlign: "right",
  },
});

// Strip HTML and return structured content blocks
export interface TextBlock {
  type:
    | "paragraph"
    | "heading1"
    | "heading2"
    | "heading3"
    | "blockquote"
    | "code"
    | "listitem"
    | "tablerow";
  text: string;
  /**
   * `tablerow`의 오른쪽 칸. SMART 목표가 라벨과 답을 두 칸으로 냅니다.
   *
   * 표를 따로 다루지 않으면 `<table>` 전체가 문단 하나로 뭉쳐서
   * 다섯 항목의 라벨과 답이 한 줄에 이어 붙습니다.
   */
  value?: string;
}

export function stripHtmlForPdf(html: string): TextBlock[] {
  if (!html || html.trim() === "") return [];

  const blocks: TextBlock[] = [];

  // Decode HTML entities
  const decodeEntities = (str: string): string =>
    str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/");

  /**
   * 태그 제거 → 엔티티 복원 → 공백 접기 순입니다.
   *
   * 엔티티를 나중에 풀면 `&nbsp;`만 든 빈 칸이 공백 한 칸으로 남아
   * "비어 있음"과 구분되지 않습니다. 태그 제거를 먼저 하는 이유는
   * 반대로 `&lt;`가 복원된 뒤 태그로 오인되지 않게 하기 위해서입니다.
   */
  const innerText = (s: string): string =>
    decodeEntities(s.replace(/<[^>]*>/g, ""))
      .replace(/\s+/g, " ")
      .trim();

  const processedHtml = html
    // Normalize line breaks inside tags
    .replace(/<br\s*\/?>/gi, "\n")
    // Remove inline tags keeping their content
    .replace(/<(?:strong|b|em|i|u|s|span|a)[^>]*>([\s\S]*?)<\/(?:strong|b|em|i|u|s|span|a)>/gi, "$1");

  // Split by block-level tags
  const segments = processedHtml.split(
    /(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<pre[^>]*>[\s\S]*?<\/pre>|<li[^>]*>[\s\S]*?<\/li>|<tr[^>]*>[\s\S]*?<\/tr>)/gi
  );

  for (const seg of segments) {
    if (!seg.trim()) continue;

    const h1Match = seg.match(/^<h1[^>]*>([\s\S]*?)<\/h1>$/i);
    const h2Match = seg.match(/^<h2[^>]*>([\s\S]*?)<\/h2>$/i);
    const h3Match = seg.match(/^<h3[^>]*>([\s\S]*?)<\/h3>$/i);
    const h456Match = seg.match(/^<h[456][^>]*>([\s\S]*?)<\/h[456]>$/i);
    const pMatch = seg.match(/^<p[^>]*>([\s\S]*?)<\/p>$/i);
    const bqMatch = seg.match(/^<blockquote[^>]*>([\s\S]*?)<\/blockquote>$/i);
    const preMatch = seg.match(/^<pre[^>]*>([\s\S]*?)<\/pre>$/i);
    const liMatch = seg.match(/^<li[^>]*>([\s\S]*?)<\/li>$/i);
    const trMatch = seg.match(/^<tr[^>]*>([\s\S]*?)<\/tr>$/i);

    if (trMatch) {
      const cells = [...trMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => innerText(cell[1]));
      const text = cells[0] ?? "";
      const value = cells.slice(1).filter(Boolean).join(" ");
      // 라벨도 답도 없는 줄은 버립니다. 답을 쓰지 않은 SMART 항목은
      // 라벨이 남아 있으므로 여기서 사라지지 않습니다.
      if (text || value) blocks.push({ type: "tablerow", text, value });
      continue;
    }

    if (h1Match) {
      const text = innerText(h1Match[1]);
      if (text) blocks.push({ type: "heading1", text });
    } else if (h2Match) {
      const text = innerText(h2Match[1]);
      if (text) blocks.push({ type: "heading2", text });
    } else if (h3Match || h456Match) {
      const text = innerText((h3Match || h456Match)![1]);
      if (text) blocks.push({ type: "heading3", text });
    } else if (pMatch) {
      const text = innerText(pMatch[1]);
      if (text) blocks.push({ type: "paragraph", text });
    } else if (bqMatch) {
      const text = innerText(bqMatch[1]);
      if (text) blocks.push({ type: "blockquote", text });
    } else if (preMatch) {
      const text = decodeEntities(preMatch[1].replace(/<[^>]*>/g, ""));
      if (text) blocks.push({ type: "code", text });
    } else if (liMatch) {
      const text = innerText(liMatch[1]);
      if (text) blocks.push({ type: "listitem", text });
    } else {
      // Plain text segment (not wrapped in a known tag)
      const text = innerText(seg);
      if (text && text.length > 0) {
        blocks.push({ type: "paragraph", text });
      }
    }
  }

  return blocks;
}

// Cover page component
function CoverPage({ book, authorName }: { book: Book; authorName: string }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={styles.coverTitle}>{book.title}</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverAuthor}>{authorName}</Text>
        {book.description && (
          <Text style={styles.coverDescription}>{book.description}</Text>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>{book.title}</Text>
        <Text style={styles.footerPage}>Cover</Text>
      </View>
    </Page>
  );
}

// Table of contents page
function TOCPage({ book, chapters }: { book: Book; chapters: Chapter[] }) {
  return (
    <Page size="A4" style={styles.tocPage}>
      <Text style={styles.tocTitle}>목차 (Table of Contents)</Text>
      {chapters.map((ch, i) => (
        <View key={ch.id} style={styles.tocItem}>
          <Text style={styles.tocItemTitle}>
            {ch.title}
          </Text>
          <View style={styles.tocItemDots} />
          <Text style={styles.tocItemPage}>{i + 3}</Text>
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>{book.title}</Text>
        <Text style={styles.footerPage}>2</Text>
      </View>
    </Page>
  );
}

// Single chapter page
function ChapterPage({
  chapter,
  answers,
  orphans,
}: {
  chapter: Chapter;
  answers: FallbackAnswers;
  orphans: readonly string[];
}) {
  const blocks = stripHtmlForPdf(
    applyTemplateFallback(chapter.content_html || chapter.content_raw || "", {
      answers,
      // 번들한 한글 폰트에 이모지 글리프가 없습니다.
      emoji: false,
    }),
  );

  return (
    <Page size="A4" style={styles.chapterPage}>
      <Text style={styles.chapterTitle}>{chapter.title}</Text>

      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading1":
            return (
              <Text key={i} style={styles.heading1}>
                {block.text}
              </Text>
            );
          case "heading2":
            return (
              <Text key={i} style={styles.heading2}>
                {block.text}
              </Text>
            );
          case "heading3":
            return (
              <Text key={i} style={styles.heading3}>
                {block.text}
              </Text>
            );
          case "blockquote":
            return (
              <Text key={i} style={styles.blockquote}>
                {block.text}
              </Text>
            );
          case "code":
            return (
              <Text key={i} style={styles.codeBlock}>
                {block.text}
              </Text>
            );
          case "listitem":
            return (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listContent}>{block.text}</Text>
              </View>
            );
          case "tablerow":
            return (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableLabel}>{block.text}</Text>
                <Text style={styles.tableValue}>{block.value || ""}</Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={styles.paragraph}>
                {block.text}
              </Text>
            );
        }
      })}

      {blocks.length === 0 && (
        <Text style={{ ...styles.paragraph, color: PDF_COLORS.faint }}>
          (내용 없음)
        </Text>
      )}

      {orphans.length > 0 && (
        <View style={styles.orphanSection}>
          <Text style={styles.orphanTitle}>
            저자가 이후 수정한 문항의 답
          </Text>
          <Text style={styles.orphanNote}>
            아래 답을 받던 문항은 저자가 책을 고치면서 사라졌어요. 질문
            문구는 남아 있지 않지만 쓰신 내용은 그대로예요.
          </Text>
          {orphans.map((text, i) => (
            <Text key={i} style={styles.orphanAnswer}>
              {text}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.footer} fixed>
        <Text style={styles.footerTitle}>{chapter.title}</Text>
        <Text
          style={styles.footerPage}
          render={({ pageNumber: pn }) => `${pn}`}
        />
      </View>
    </Page>
  );
}

/**
 * 정의가 사라진 문항의 자유서술 답.
 *
 * 자유서술만 담는 이유는 문항 문구가 남아 있지 않기 때문입니다. 저자가
 * 문항을 지우면 라벨도 함께 지워져서, 체크 여부(`true`)나 척도 값(`7`)은
 * 질문 없이 읽으면 아무 의미가 없습니다. 글로 쓴 답은 그 자체로 읽힙니다.
 */
export interface OrphanedTextAnswer {
  chapter_id: string;
  text: string;
}

// Main PDF Document
export interface BookPDFProps {
  book: Book;
  chapters: Chapter[];
  authorName: string;
  /** block_id → (field_key → 값). 비우면 빈 워크시트가 나옵니다. */
  answers?: FallbackAnswers;
  orphans?: readonly OrphanedTextAnswer[];
}

export function BookPDF({
  book,
  chapters,
  authorName,
  answers = {},
  orphans = [],
}: BookPDFProps) {
  const orphansByChapter = new Map<string, string[]>();
  for (const orphan of orphans) {
    const list = orphansByChapter.get(orphan.chapter_id);
    if (list) list.push(orphan.text);
    else orphansByChapter.set(orphan.chapter_id, [orphan.text]);
  }

  return (
    <Document
      title={book.title}
      author={authorName}
      subject={book.description ?? ""}
      creator="inspic"
      producer="inspic PDF Generator"
    >
      <CoverPage book={book} authorName={authorName} />
      {chapters.length > 1 && <TOCPage book={book} chapters={chapters} />}
      {chapters.map((ch) => (
        <ChapterPage
          key={ch.id}
          chapter={ch}
          answers={answers}
          orphans={orphansByChapter.get(ch.id) ?? []}
        />
      ))}
    </Document>
  );
}
