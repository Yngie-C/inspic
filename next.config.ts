import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 한글 PDF 폰트는 서버가 파일시스템에서 읽습니다. public/ 아래 파일은
  // 정적 자산으로 배포되지만 서버리스 함수의 파일시스템에 들어간다는
  // 보장은 없어서, 이 라우트 번들에 명시적으로 포함시킵니다.
  outputFileTracingIncludes: {
    "/api/pdf": ["./public/fonts/*.ttf"],
  },
};

export default nextConfig;
