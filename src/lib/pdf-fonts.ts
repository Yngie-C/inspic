import { existsSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * PDF에 한글을 찍기 위한 폰트 등록.
 *
 * 내장 Helvetica로는 한글이 나오지 않습니다. 글리프가 없어서 한 글자가
 * Latin-1 한 바이트로 매핑되고, **렌더는 성공한 채 글자만 깨집니다.**
 * 예외가 나지 않으므로 테스트가 아니라 눈으로만 잡히는 종류의 실패입니다.
 *
 * 폰트 파일은 `public/fonts/`에 커밋돼 있습니다. 이유와 다시 만드는
 * 방법은 그쪽 README를 보세요.
 */

export const PDF_FONT_FAMILY = "NotoSansKR";

const FONT_FILES = [
  { file: "NotoSansKR-Regular.subset.ttf", fontWeight: "normal" as const },
  { file: "NotoSansKR-Bold.subset.ttf", fontWeight: "bold" as const },
];

let registered = false;

/**
 * 폰트를 등록합니다. 여러 번 불러도 한 번만 등록합니다.
 *
 * 파일이 없으면 던집니다. Helvetica로 조용히 물러서면 한글이 깨진 PDF가
 * 정상인 것처럼 나가는데, 그건 "PDF를 못 만들었습니다"보다 나쁩니다 —
 * 독자는 받고 나서야 알게 되고 우리는 영영 모릅니다.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  const dir = path.join(process.cwd(), "public", "fonts");

  const sources = FONT_FILES.map(({ file, fontWeight }) => {
    const src = path.join(dir, file);
    if (!existsSync(src)) {
      throw new Error(
        `PDF 한글 폰트를 찾을 수 없습니다: ${src}. ` +
          `배포에 public/fonts/가 포함됐는지 확인하세요 (next.config.ts의 outputFileTracingIncludes).`,
      );
    }
    return { src, fontWeight, fontStyle: "normal" as const };
  });

  Font.register({ family: PDF_FONT_FAMILY, fonts: sources });

  // 한글은 어절 단위로 줄바꿈합니다. 기본 하이픈 분해기는 라틴 문자를
  // 가정하고 있어 단어를 엉뚱한 자리에서 자릅니다.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
