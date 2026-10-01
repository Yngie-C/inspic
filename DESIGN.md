---
version: alpha
name: Inspic
description: 적용하는 책을 위한 인터랙티브 워크북 리더와 출판 플랫폼. 명료하고, 도구적이고, 가벼운 화면에 코랄 한 점.
colors:
  primary: "#000000"
  muted: "#5E5A54"
  faint: "#736E67"
  accent: "#F95C4B"
  accent-hover: "#E8503F"
  on-accent: "#000000"
  on-primary: "#F6F4F1"
  paper: "#F6F4F1"
  surface: "#FFFFFF"
  mark: "#E4DED2"
  line: "#E4DED2"
  line-strong: "#C9C1B2"
  field: "#FFFFFF"
  field-line: "#C9C1B2"
  danger: "#B42318"
  success: "#2F6B3A"
  warning: "#8A5A00"
  info: "#2C5B66"
typography:
  display:
    fontFamily: Pretendard
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.025em
  title:
    fontFamily: Pretendard
    fontSize: 21px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.015em
  subtitle:
    fontFamily: Pretendard
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  body-reader:
    fontFamily: Pretendard
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.78
  body:
    fontFamily: Pretendard
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Pretendard
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: Pretendard
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Pretendard
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.08em
  button:
    fontFamily: Pretendard
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: ui-monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.65
rounded:
  xs: 3px
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "14": 56px
components:
  page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  reader-body:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    typography: "{typography.body-reader}"
  text-muted:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 16px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 16px
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.danger}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 16px
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 12px
  input-placeholder:
    backgroundColor: "{colors.field}"
    textColor: "{colors.muted}"
  input-border:
    backgroundColor: "{colors.field-line}"
  workbook-block:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 18px 20px
  workbook-block-border:
    backgroundColor: "{colors.line}"
  workbook-block-label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  workbook-state-saved:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
  scale-cell:
    backgroundColor: "{colors.field}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  scale-cell-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  current-item:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  divider:
    backgroundColor: "{colors.line}"
  divider-strong:
    backgroundColor: "{colors.line-strong}"
  code-block:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px 18px
  cover-stone:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  cover-white:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  cover-border:
    backgroundColor: "{colors.line}"
  callout-rule:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  toast:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  message-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.danger}"
    typography: "{typography.body-sm}"
  message-success:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.success}"
    typography: "{typography.body-sm}"
  message-warning:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.warning}"
    typography: "{typography.body-sm}"
  message-info:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.info}"
    typography: "{typography.body-sm}"
  disabled-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.faint}"
---

# Inspic DESIGN.md

> UI 작업 전에 이 문서를 읽는다. 여기 적히지 않은 값은 기본값(회색, 파랑, 보라, Inter)으로 새지 않도록, 가장 가까운 토큰을 고르고 이 문서에 추가한다.
> 방향을 정한 근거는 `docs/design/brief.md`에 있다(A안 "절제" 선택, 2026-09-30). 목업은 https://claude.ai/artifact/JWt3TnvjEoMmCygwfatuGc 에 있다.

## Overview

Inspic은 "읽는 책이 아니라 적용하는 책"이다. 화면의 일은 두 가지다. 책이 말하게 두는 것, 그리고 독자가 쓸 자리를 분명히 내주는 것이다.

- **명료한**: 위계는 크기, 굵기, 간격, 1px 선만으로 만든다. 본문과 입력은 한눈에 구분된다.
- **도구적인**: 상태(작성 전, 저장됨, n개 중 m개, 읽는 중)가 항상 텍스트로 보인다.
- **가벼운**: 평면이다. 그림자는 없고, 한 화면에 쓰는 색은 적다.

정체성은 색이 맡는다. 네 색뿐이다 — Paper 바탕, Stone 면과 선, 검정 잉크, 그리고 Coral. Coral은 **면·점·선**으로만 쓰고 글자로는 쓰지 않는다. 구조가 조용하기 때문에 코랄 한 점이 브랜드가 된다.

라이트 모드만 지원한다. 다크 모드는 비활성화 상태이며, 추가하려면 이 문서에 팔레트를 먼저 정의한다.

## Colors

색마다 역할이 정해져 있다. 역할 밖에서 쓰지 않는다.

- **primary / 잉크 (#000000)**: Black. 본문, 헤딩, 링크, 아이콘, 로고, 상태 텍스트, focus ring, 코드 블록 면, 토스트 면에 쓴다.
- **muted (#5E5A54)**: 따뜻한 회색. 보조 텍스트다. 메타 정보, 블록 라벨, placeholder, 캡션에 쓴다. 대비는 paper 위 6.24다.
- **faint (#736E67)**: 비활성 텍스트 전용이다. 대비는 4.6으로 AA를 겨우 넘는다. muted와 구분되도록 **비활성 외의 용도에는 쓰지 않는다.**
- **accent (#F95C4B)**: Coral. 유일한 강조색이고, **면·점·선으로만 쓴다. 글자색으로 쓰지 않는다**(paper 위 2.87). 쓸 수 있는 곳은 다음뿐이다.
  - 주요 버튼 면
  - 진행 바
  - 선택된 척도 칸
  - 체크박스(`accent-color`)
  - 저장 표시 점(상태 문구 앞 6px 점)
  - focus ring은 **accent가 아니라 잉크**다. Coral은 비텍스트 기준 3:1에도 못 미친다(2.87).
- **on-accent (#000000)**: accent 면 위의 텍스트다(대비 6.66, hover 면 5.65). 흰 글자는 3.15라 쓰지 않는다.
- **on-primary (#F6F4F1)**: 잉크 면 위의 텍스트다. 토스트, 툴팁, 코드 블록, 아바타, 에디터 툴바의 활성 버튼에 쓴다(대비 19.13).
- **paper (#F6F4F1)**: Paper. 페이지 바탕이다.
- **surface (#FFFFFF)**: paper 위에 올라가는 면이다. 드롭다운, 모달, 입력에 쓴다. paper와 대비가 거의 없으므로(1.1) 반드시 테두리와 함께 쓴다.
- **mark (#E4DED2)**: Stone. 현재 위치(목차의 현재 장), 본문 `strong` 하이라이트, hover 면, 표지 면이다. paper와 대비가 1.22라 면끼리 붙일 때는 선을 둔다.
- **line (#E4DED2) / line-strong (#C9C1B2)**: 1px 선이다. `line`(Stone)은 구획과 블록 테두리에, `line-strong`(진한 Stone)은 컨트롤 테두리 hover와 강한 구분선에 쓴다.
- **field (#FFFFFF) / field-line (#C9C1B2)**: 흰 면 + 진한 Stone 테두리다. **"내가 쓰는 영역"**을 뜻하며, 독자와 저자가 입력하는 모든 필드(textarea, input, 척도 칸)에 쓴다. 토큰 이름은 역할을 가리키므로 값이 surface와 같아도 따로 둔다. 단, **검색창은 예외로 paper 면에 field-line 테두리**를 쓴다. 검색은 길 찾기 도구라 흰 면이 필요 없고, 화면에 순백이 있으면 그것이 흰색 기준이 되어 paper 바탕이 회색으로 읽히기 때문이다(2026-10-01 결정).
- 표지 면은 옅은 색만 쓴다(Stone, 흰색). 짙은 면(accent, primary)을 표지에 칠하지 않는 이유는, 표지가 여러 권 모이면 코랄과 검정 판이 화면을 덮어 "코랄 한 점"이 무너지기 때문이다(2026-10-01 결정).
- **상태색 (danger #B42318, success #2F6B3A, warning #8A5A00, info #2C5B66)**: 텍스트, 아이콘, 1px 테두리로만 쓴다. **면을 칠하지 않는다.**
  - danger는 accent와 색상이 가깝다(대비 2.09). 그래서 항상 오류 문장과 함께 쓴다.
  - 파괴적 동작은 `button-danger`(면 없음 + danger 텍스트 + danger 테두리)로 만든다.

금지 조합: Coral 글자(paper 위 2.87), Coral 면 위 흰 글자(3.15). 흰색·Stone과 paper는 테두리 없이 면끼리 붙이지 않는다(대비 1.1, 1.22). 조합별 대비는 `docs/design/brief.md`에 표로 있다.

## Typography

- **Pretendard 한 계열**을 본문, UI, 헤딩에 모두 쓴다. 한글 글리프가 반드시 포함돼야 한다(dynamic subset 또는 가변 폰트). fallback 스택은 `Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`다.
- 코드는 시스템 모노를 쓴다: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- 스케일은 다음과 같다. 이 밖의 크기를 새로 만들지 않는다.

  | 토큰 | 크기 | 쓰는 곳 |
  |---|---|---|
  | display | 32px, 모바일 25px | 장 제목, 책 제목 |
  | title | 21px | 본문 h2, 섹션 제목 |
  | subtitle | 16px / 600 | 블록 질문, 카드 제목 |
  | body-reader | 17px, 모바일 16px | 리더 본문 |
  | body | 15px | 일반 UI, 블록 내부 |
  | body-sm | 14px | 목차, 버튼, 표 |
  | caption | 13px | 메타, 상태 |
  | label | 12px / 700 / 0.08em | 블록 종류 라벨, 목록 섹션 제목(목차, 많이 읽는 책 등). 한글이므로 대문자 변환은 없다 |

- 리더 본문의 한 줄은 최대 38em(약 650px)이다. 헤딩에는 `text-wrap: balance`를 준다. 숫자가 줄을 맞춰야 하는 곳(목차 번호, 척도, 진행률)에는 `tabular-nums`를 쓴다.
- 굵기는 400, 600, 700 세 가지만 쓴다. 로고만 800이다.
- 이탤릭은 쓰지 않는다. 강조는 굵기와 `mark` 면으로 한다(PDF 내보내기의 이탤릭 제약과도 일치한다).
- 본문 링크는 잉크색에 밑줄(1px, offset 3px)이다. 색으로 링크를 구분하지 않는다.
- PDF 내보내기(react-pdf)는 별도 한글 폰트 파이프라인(`scripts/build-korean-font.sh`)을 쓴다. 이 문서의 폰트 규칙은 웹 화면에 적용된다.

## Layout

- 간격은 4px 격자다(`spacing` 토큰). 형제 요소 사이 간격은 margin 대신 flex나 grid의 `gap`으로 준다.
- 리더:
  - 데스크톱: 왼쪽 목차 레일(248px, 오른쪽 1px 선)과 본문 열로 나눈다. 본문 여백은 48px 위, 56px 좌우다. 문단과 블록 사이 간격은 22px이다.
  - 모바일(600px 이하): 목차를 숨기고 한 열로 둔다. 좌우 여백은 16px이다.
- 상단 바: 높이 약 48px에 아래 1px 선을 둔다. 진행률은 바 하단의 2px accent 선으로 표시한다.
- 책 상세: 표지(220px, 3:4)와 메타 열로 된 2열이다. 모바일에서는 표지 156px로 한 열이 된다. 사실 정보(읽는 시간, 구성, 대상)는 위아래 1px 선 사이에 한 줄로 둔다. 목차는 메타 열과 같은 오른쪽 끝에서 끝난다. "이 저자의 다른 책" 표지는 144px로, 본 표지보다 크게 두지 않는다.
- 탐색 그리드: 데스크톱(900px 초과) 4열, 태블릿 3열, 모바일 2열이다. 카드 사이 간격은 24px, 모바일 16px이다. 표지가 화면을 뒤덮지 않도록 한 표지의 폭은 약 210px를 넘기지 않는다. "많이 읽는 책" 줄은 데스크톱에서 6칸 격자(잘리지 않음), 모바일에서 가로 스크롤이다.
- 헤더: 로고와 내비는 왼쪽에 붙이고, 검색과 계정은 오른쪽에 둔다. 헤더 버튼은 모두 secondary나 ghost다(accent는 본문의 주요 행동 몫). 탐색 페이지에서는 본문 검색창과 겹치므로 헤더 검색을 숨긴다.
- 가운데 정렬은 빈 상태와 인증 폼에만 쓴다. 나머지는 왼쪽 정렬이다.

## Elevation & Depth

- **그림자로 위계를 만들지 않는다.** 구분은 1px `line`과 면색(paper / surface / field / mark)으로 한다.
- 예외는 떠 있는 레이어(드롭다운 메뉴, 모달, 토스트)뿐이다. 이때 쓰는 그림자는 `0 4px 16px rgba(0, 0, 0, 0.08)` 하나이며, `line` 테두리와 함께 쓴다.
- 모달 배경막은 `rgba(0, 0, 0, 0.4)`다. blur는 쓰지 않는다.
- 겹침, 기울임, 떠오르는 카드는 쓰지 않는다.

## Shapes

- radius:
  - xs 3px: 작은 배지
  - sm 4px: 척도 칸, 인라인 코드, 표지, 목차 항목
  - md 6px: 버튼, 입력, 코드 블록, 토스트
  - lg 8px: 워크북 블록, 모달. **이것이 최대값이다**
- full은 상태 점(6px 원)과 아바타에만 쓴다. 알약 모양 버튼과 배지는 쓰지 않는다.
- 선은 1px이다. 2px는 진행 바, focus ring, Callout의 왼쪽 세로선에만 쓴다. 본문 인용(blockquote)은 1px `line-strong` 세로선에 왼쪽 여백 16px로, Callout보다 한 단계 낮춘다.

## Components

- **버튼**:
  - primary: accent 면에 on-accent 텍스트다. 한 화면(또는 한 블록)에 하나만 둔다.
  - secondary: 면이 없고(투명, 놓인 바탕을 따른다) `line-strong` 테두리다. hover 시 테두리가 잉크색이 된다. 흰 면을 두지 않는 이유는 검색창과 같다 — 화면에 순백이 있으면 paper가 회색으로 읽힌다(2026-10-01 결정).
  - danger: 면 없이 danger 텍스트와 테두리다.
  - hover에서 이동이나 그림자 변화를 주지 않는다. 색만 바뀐다.
- **입력**: field 면에 field-line 1px 테두리를 쓴다. focus는 2px 잉크 outline(offset 1px)이다. placeholder는 muted다. 오류는 테두리를 danger로 바꾸고, 필드 아래에 danger 텍스트로 이유와 해결 방법을 쓴다.
- **워크북 블록 (입력 블록 4종: 체크리스트·척도·성찰·목표)**: 면색 없이 paper 위에 `line` 1px 박스(radius lg, padding 18px 20px)를 둔다. **박스는 "내가 쓰는 영역"이 있는 블록 전용이다.** 내부 구성은 다음과 같다.
  1. 머리 줄: 왼쪽에 종류 라벨(label, muted), 오른쪽에 상태(caption)를 둔다.
  2. 질문: subtitle로 쓴다.
  3. 입력 영역: field 면이다.
  4. 선택: 보조 버튼이 있다면 오른쪽 끝에 둔다.
  - 라벨 문구: `체크리스트` · `척도` · `성찰` · `목표` · `참고`/`팁`/`주의`/`정보`(Callout 유형별)
  - 상태 문구: `작성 전`(muted), `저장됨 · 방금`(잉크 600, 앞에 6px accent 점), `작성함`(muted, 불러온 답. 서버 답인지 캐시에만 있는 답인지 구분할 수 없어 "저장됨"이라 하지 않는다), `3개 중 2개`(모두 완료되면 잉크 600), `7 선택됨`(muted, 칸이 이미 선택을 보여 준다)
  - 진행 문구(체크리스트·척도)는 이번 세션에서 저장에 성공하면 뒤에 `· 저장됨`을 붙인다.
  - 저장 실패: 상태는 `저장 안 됨`(danger, 600)이고, 블록 아래에 이유와 해결 방법을 danger 문장으로 쓴다("이 답을 저장하지 못했어요. 연결을 확인한 뒤 다시 시도하세요. [다시 시도]"). 네트워크 실패이므로 입력 테두리는 바꾸지 않는다(입력 오류처럼 읽힌다).
  - 블록 종류를 **면색이나 아이콘 색으로 구분하지 않는다.** 구분은 라벨 텍스트가 한다.
  - **Callout**(참고·팁·주의·정보)은 입력이 없는 "책이 말하는 영역"이라 박스를 쓰지 않는다. 왼쪽 2px `line-strong` 세로선, 왼쪽 여백 16px, 위아래 4px에 라벨 줄과 본문(body)만 둔다. 면색과 radius는 없다. `주의` 라벨만 warning 색이다. 이모지는 쓰지 않는다(2026-10-01 결정: 박스가 연달아 이어져 입력 블록과 구분되지 않았다).
  - 편집 뷰(`editor/extensions/templates/*NodeView.tsx`)와 읽기 뷰(`reader/templates/*`)는 같은 시각 언어를 쓴다. 편집 뷰에는 라벨 줄 오른쪽에 편집 컨트롤만 추가한다.
- **척도**: 10칸 격자다. 모바일에서 7칸을 넘으면 두 줄(5×2)로 접어 칸 높이 44px를 지킨다. 칸은 field 면에 field-line 테두리, radius sm이다. 선택된 칸은 accent 면에 on-accent 굵은 숫자다. 양 끝 라벨은 칸 아래에 caption muted로 둔다.
- **체크리스트**: 네이티브 checkbox에 `accent-color: accent`를 준다. 체크된 항목은 muted 색에 1px 취소선이다.
- **코드 블록**: 잉크 면에 on-primary 텍스트, radius md다. 인라인 코드는 surface 면에 `line` 테두리, radius sm, 0.86em이다.
- **책 표지 플레이스홀더** (`BookCover` 하나로 통일한다): 옅은 단색 면 2종(Stone, 흰색. 둘 다 잉크 글자) 중 하나를 책 id 해시로 고른다. paper와 대비가 낮으므로 항상 1px 테두리(`line` 또는 잉크 10%)와 함께 쓴다. 제목은 표지 위에 700으로, 하단에 `INSPIC`를 label로 둔다. 그라디언트는 쓰지 않는다.
- **탐색 카드**: 표지, 제목(subtitle), 메타(caption muted) 순이다. 카드 테두리와 면은 없다. hover 시 제목에 밑줄만 생긴다.
- **목차 항목**: 현재 장은 mark 면에 600 굵기이고, 번호는 잉크다. 다른 장의 번호는 muted다. 현재 장 번호에 accent를 쓰지 않는다 — 상단 바의 진행 선과 겹친다(2026-10-01 결정).
- **토스트**: 잉크 면에 on-primary 텍스트, radius md다. 떠 있는 레이어 그림자를 쓴다. 문구는 결과를 말한다("저장했어요", "링크를 복사했어요").
- **아이콘**: lucide를 쓴다. 16~18px, stroke 1.75, 색은 텍스트 색을 따른다. 아이콘을 원이나 사각 배경 위에 올리지 않는다.

## Motion

- 전환은 150ms `ease-out`이다. 대상은 색, 테두리색, opacity만이다.
- 크기, 위치, 그림자를 애니메이션하지 않는다. 드롭다운과 모달만 120ms opacity fade를 허용한다.
- 페이지 진입 애니메이션, 스크롤 트리거, 반짝임, 로딩 shimmer는 쓰지 않는다. 로딩은 `Spinner`나 텍스트("불러오는 중")로 표시한다.
- `prefers-reduced-motion: reduce`에서는 모든 전환을 끈다.

## Voice

톤은 "바로 써먹는 지식을 짧게 읽는다"다(2026-10-01 결정). 랜딩 hero는 독자만 상대한다.

- **해요체**로 쓴다. 예외는 법률 문서(`terms`, `privacy`)와 결제 동의 문장("…동의합니다")이다.
- **기능이 실제로 하는 일만** 쓴다. "경험·여정·이야기·나만의·누구나·안전하게·간편하게" 같은 수식어, 느낌표, 세 단어 슬로건("읽고, 쓰고, 적용하세요")은 쓰지 않는다.
- 한 문장에는 하나만 말한다. 버튼에는 동사를 쓴다("책 둘러보기", "PDF 받기"). 로딩 문구에 `...`을 붙이지 않는다.
- 오류 문구는 무엇이 안 됐는지와 다음에 할 일을 함께 쓴다("저장하지 못했어요. 연결을 확인해 주세요").

| 쓰는 말 | 쓰지 않는 말 | 비고 |
|---|---|---|
| 책 | 콘텐츠, 전자책, 작품 | "워크북"은 책의 성격을 말할 때와 `내 워크북` 메뉴에만 쓴다 |
| 장 | 챕터 | 리더·편집기·검수 메시지 모두 |
| 공개 / 공개 중 | 발행, 출판, 출간, 출판됨 | 실제 버튼이 "공개하기"다 |
| 저자 (독자가 보는 화면) · 크리에이터 (저자 본인이 보는 화면) | 고객, 작가 | 스튜디오·편집·검수·분석·소개의 크리에이터 묶음이 "크리에이터"다 |
| 체크리스트 · 척도 · 성찰 · 목표 · 참고 | 리플렉션, 스케일, 콜아웃 | 블록 라벨과 같게 한다. 슬래시 메뉴의 영문 별칭은 검색용으로 남긴다 |
| 체크리스트와 질문 (구체적으로) | 워크시트 | 독자에게 하는 말에서 |

## Do's and Don'ts

**Do**
- 새 색이 필요하면 먼저 위 토큰 중에서 고른다. 없으면 이 문서에 역할과 함께 추가한다.
- 상태를 텍스트로 쓴다("저장됨 · 방금", "3개 중 2개").
- 한 화면의 주요 행동은 accent 버튼 하나로 둔다.
- 오류 문구에는 무엇이 잘못됐고 어떻게 고치는지를 쓴다.

**Don't** (grep으로 검사한다)
- 그라디언트 전반(`bg-gradient-*`, `from-*`/`to-*`, `linear-gradient`). 특히 무지개 표지 배열
- blur glow blob, `blur-[…]`, `backdrop-blur`, `backdrop-filter`
- 아이콘 원 + 제목 + 설명으로 된 카드 3개 배열
- hover lift(`hover:-translate-y-*`, `hover:shadow-*`, `hover:scale-*`)
- 아이콘 대신 이모지(💡, ⚠️, ✨, 🎉 등)
- 보라, 인디고, 파랑 계열 전반(`purple-*`, `violet-*`, `indigo-*`, `blue-*`). 파랑 focus ring 포함
- 기존 오렌지 `brand-*` 팔레트와 미사용 `--color-brand-primary*`(폐기)
- Tailwind 기본 `gray-*`, `slate-*`, `zinc-*`, `neutral-*`, `stone-*`: primary, muted, faint, line, mark 토큰으로 대체한다
- Geist, Inter, Space Grotesk를 본문에 쓰는 것. Playfair 등 라틴 전용 세리프를 한글에 거는 것
- 이탤릭
- 그림자로 카드 위계를 만드는 것. `rounded-xl` 이상의 radius, 알약 버튼과 배지
- 가운데 정렬 hero와 배지 조합
- Coral(`text-accent`) 글자색. 로고와 상태 문구도 잉크로 쓴다
- Coral 면 위 흰 글자
