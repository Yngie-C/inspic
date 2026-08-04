import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 이 파일은 jsdom 테스트와 node 테스트(예: 스키마 검증) 양쪽에서 돕니다.
// 브라우저 전용 정리는 그 환경에서만 합니다.
afterEach(() => {
  cleanup();
  if (typeof localStorage !== "undefined") localStorage.clear();
});
