import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vite 플러그인을 쓰지 않습니다.
 *
 * vitest는 자체 vite 사본을 물고 있어서, 최상위 vite에 맞춰 컴파일된
 * 플러그인을 넣으면 두 vite의 타입이 충돌해 `tsc --noEmit`이 깨집니다.
 * 테스트에 필요한 건 경로 별칭과 JSX 변환뿐이고 둘 다 설정으로 됩니다.
 * (JSX는 tsconfig의 `jsx: react-jsx`를 그대로 따릅니다.)
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
