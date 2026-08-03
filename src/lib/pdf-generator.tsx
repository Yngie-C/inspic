import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Book, Chapter } from "@/types";
import { applyTemplateFallback } from "./template-fallback";

// Register a standard font (Helvetica is built-in, no external download needed)
// Korean characters will fall back to the default renderer behavior
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  coverPage: {
    fontFamily: "Helvetica",
    fontSize: 11,
    paddingTop: 120,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: "#111111",
    marginBottom: 24,
    lineHeight: 1.3,
  },
  coverAuthor: {
    fontSize: 16,
    fontFamily: "Helvetica",
    textAlign: "center",
    color: "#555555",
    marginBottom: 40,
  },
  coverDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#cccccc",
    marginBottom: 32,
  },
  coverDescription: {
    fontSize: 12,
    fontFamily: "Helvetica",
    textAlign: "center",
    color: "#666666",
    lineHeight: 1.6,
    maxWidth: 360,
  },
  tocPage: {
    fontFamily: "Helvetica",
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 72,
    paddingRight: 72,
  },
  tocTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
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
    color: "#333333",
    flex: 1,
    paddingRight: 8,
  },
  tocItemDots: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomStyle: "dotted",
    borderBottomColor: "#cccccc",
    marginBottom: 3,
    marginHorizontal: 8,
  },
  tocItemPage: {
    fontSize: 11,
    color: "#888888",
    width: 30,
    textAlign: "right",
  },
  chapterPage: {
    fontFamily: "Helvetica",
    fontSize: 11,
    paddingTop: 60,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  chapterTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 16,
    lineHeight: 1.3,
  },
  paragraph: {
    fontSize: 11,
    marginBottom: 14,
    lineHeight: 1.7,
    textAlign: "justify",
    color: "#222222",
  },
  heading1: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    marginTop: 24,
    marginBottom: 12,
    lineHeight: 1.3,
  },
  heading2: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#222222",
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 1.3,
  },
  heading3: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  blockquote: {
    fontSize: 11,
    color: "#555555",
    fontFamily: "Helvetica-Oblique",
    borderLeftWidth: 3,
    borderLeftColor: "#cccccc",
    paddingLeft: 16,
    marginBottom: 14,
    marginVertical: 8,
    lineHeight: 1.7,
  },
  codeBlock: {
    fontSize: 10,
    fontFamily: "Courier",
    backgroundColor: "#f5f5f5",
    padding: 12,
    marginBottom: 14,
    lineHeight: 1.5,
    color: "#333333",
  },
  listItem: {
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 1.7,
    color: "#222222",
    flexDirection: "row",
  },
  listBullet: {
    width: 16,
    fontSize: 11,
    color: "#555555",
  },
  listContent: {
    flex: 1,
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
    borderTopColor: "#e5e5e5",
    paddingTop: 8,
  },
  footerTitle: {
    fontSize: 9,
    color: "#999999",
    flex: 1,
  },
  footerPage: {
    fontSize: 9,
    color: "#999999",
    textAlign: "right",
  },
});

// Strip HTML and return structured content blocks
export interface TextBlock {
  type: "paragraph" | "heading1" | "heading2" | "heading3" | "blockquote" | "code" | "listitem";
  text: string;
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

  // Extract inner text from an HTML string
  const innerText = (s: string): string =>
    decodeEntities(s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());

  // Process block-level elements
  const blockRe =
    /<(h1|h2|h3|h4|h5|h6|p|blockquote|pre|li|ul|ol|div|br)[^>]*>([\s\S]*?)<\/\1>|<br\s*\/?>/gi;

  // Reset regex
  blockRe.lastIndex = 0;

  const processedHtml = html
    // Normalize line breaks inside tags
    .replace(/<br\s*\/?>/gi, "\n")
    // Remove inline tags keeping their content
    .replace(/<(?:strong|b|em|i|u|s|span|a)[^>]*>([\s\S]*?)<\/(?:strong|b|em|i|u|s|span|a)>/gi, "$1");

  // Split by block-level tags
  const segments = processedHtml.split(
    /(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<pre[^>]*>[\s\S]*?<\/pre>|<li[^>]*>[\s\S]*?<\/li>)/gi
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
  book,
  chapter,
  pageNumber,
}: {
  book: Book;
  chapter: Chapter;
  pageNumber: number;
}) {
  const blocks = stripHtmlForPdf(applyTemplateFallback(chapter.content_html || chapter.content_raw || ""));

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
          default:
            return (
              <Text key={i} style={styles.paragraph}>
                {block.text}
              </Text>
            );
        }
      })}

      {blocks.length === 0 && (
        <Text style={{ ...styles.paragraph, color: "#aaaaaa", fontFamily: "Helvetica-Oblique" }}>
          (내용 없음)
        </Text>
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

// Main PDF Document
export interface BookPDFProps {
  book: Book;
  chapters: Chapter[];
  authorName: string;
}

export function BookPDF({ book, chapters, authorName }: BookPDFProps) {
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
      {chapters.map((ch, i) => (
        <ChapterPage
          key={ch.id}
          book={book}
          chapter={ch}
          pageNumber={i + (chapters.length > 1 ? 3 : 2)}
        />
      ))}
    </Document>
  );
}
