---
name: interactive_templates_spec
description: 인터랙티브 템플릿 프레임워크 12종 구현 스펙 (Deep Interview 완료, 2단계 구현 예정)
type: project
---
> **[SUPERSEDED — 2026-08-04]** 이 문서는 MVP 재구성 이전의 계획입니다.
> 인터랙티브 템플릿은 12종에서 **MVP 5종**(체크리스트, 콜아웃, 리플렉션, SMART, 스케일)으로 축소됐고,
> 나머지 7종은 삭제됐습니다. 독자 응답 저장 방식(localStorage 전용)도 M1~M3에서 DB 기반으로 재설계됩니다.
> 현행 계획은 `docs/agent-knowledge/mvp-rebuild-plan.md`, 진행 상황은 `TODO.md`를 보세요.
> 이 문서는 historical context로만 참고하세요.



publedge에 12종 인터랙티브 템플릿 블록 구현 예정. Deep Interview 2026-04-16 완료.

**Why:** 전자책 사이사이에 독자가 직접 해볼 수 있는 프레임워크(체크리스트, 사분면 등)를 삽입하여 참여형 독서 경험 제공. 크리에이터가 코딩 없이 프리셋으로 쉽게 삽입 가능해야 함.

**How to apply:**
- 상세 스펙: `.omc/plans/interactive-template-spec.md`
- 1단계(8종): 체크리스트, 콜아웃, 리플렉션, 토글, N열 리스트, SMART, Before/After, 1-10 스케일
- 2단계(4종): 2×2 사분면, OKR, 습관 추적, WOOP
- 기술: TipTap 커스텀 Node + SlashCommand 확장, localStorage 상태 저장, 프리셋 템플릿
- PSA 프로젝트 체크리스트 참고 가능 (MiniChecklist.tsx)
