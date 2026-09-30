"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * DESIGN.md 결정 전 비교용 변형 (단계 5, 임시).
 *
 * `/dev/*` 페이지만 Provider로 값을 넣는다. 기본값은 지금 DESIGN.md의
 * 모양이라 실제 라우트는 바뀌지 않는다. 결정이 끝나면 이 파일과 사용처를
 * 지우고, 고른 모양을 컴포넌트에 직접 쓴다.
 */

export type CalloutVariant = "box" | "line" | "mark";
export type CoverVariant = "current" | "no-rosewood" | "light";

interface DesignVariants {
  callout: CalloutVariant;
  cover: CoverVariant;
}

const DEFAULTS: DesignVariants = { callout: "box", cover: "current" };

const DesignVariantContext = createContext<DesignVariants>(DEFAULTS);

export function DesignVariantProvider({
  callout,
  cover,
  children,
}: {
  callout?: string;
  cover?: string;
  children: ReactNode;
}) {
  const value: DesignVariants = {
    callout: pick(callout, ["box", "line", "mark"], DEFAULTS.callout),
    cover: pick(cover, ["current", "no-rosewood", "light"], DEFAULTS.cover),
  };
  return (
    <DesignVariantContext.Provider value={value}>
      {children}
    </DesignVariantContext.Provider>
  );
}

export function useDesignVariants(): DesignVariants {
  return useContext(DesignVariantContext);
}

function pick<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
