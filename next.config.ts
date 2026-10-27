import type { NextConfig } from "next";
import { storageImageBase } from "./src/lib/storage-image";

/**
 * next/image가 받아도 되는 원격 이미지: 우리 Supabase Storage의 공개 버킷뿐입니다.
 *
 * 표지(`BookCover`)·저자 사진은 Storage 공개 URL을 그대로 그립니다. 호스트를
 * 등록하지 않으면 next/image가 그 URL을 거절해 이미지가 깨집니다. 다른 호스트를
 * 열면 우리 서버가 아무 이미지나 대신 받아 최적화해 주는 통로가 됩니다.
 *
 * 판정은 `isStorageImageUrl()`과 같은 `storageImageBase()`에서 옵니다. 환경변수가
 * 없으면(로컬에서 .env.local 없이 빌드) 아무 호스트도 열지 않습니다.
 */
function storageImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const base = storageImageBase();
  if (!base) return [];
  const { url, publicPath } = base;
  return [
    {
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
      port: url.port,
      pathname: `${publicPath}**`,
    },
  ];
}

const nextConfig: NextConfig = {
  // 개발 서버에 폰 등 다른 기기로 붙을 때 그 주소. 예: DEV_ORIGINS=172.16.20.223
  // Next 16은 등록하지 않은 주소의 개발 리소스 요청을 막아 화면이 뜨지 않습니다.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  images: {
    remotePatterns: storageImagePatterns(),
  },
  // 한글 PDF 폰트는 서버가 파일시스템에서 읽습니다. public/ 아래 파일은
  // 정적 자산으로 배포되지만 서버리스 함수의 파일시스템에 들어간다는
  // 보장은 없어서, 이 라우트 번들에 명시적으로 포함시킵니다.
  outputFileTracingIncludes: {
    "/api/pdf": ["./public/fonts/*.ttf"],
  },
};

export default nextConfig;
