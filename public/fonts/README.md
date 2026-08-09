# PDF용 한글 폰트

`/api/pdf`가 쓰는 폰트입니다. 화면에는 쓰이지 않습니다 (웹 폰트는 `app/layout.tsx`가 따로 정합니다).

| 파일 | 웨이트 | 크기 |
|---|---|---|
| `NotoSansKR-Regular.subset.ttf` | 400 | 2.5MB |
| `NotoSansKR-Bold.subset.ttf` | 700 | 2.5MB |

## 왜 커밋돼 있나

`@react-pdf/renderer`는 내장 Helvetica만으로는 한글을 못 찍습니다. Helvetica에 한글 글리프가 없어서, 한 글자가 Latin-1 한 바이트로 매핑돼 엉뚱한 문자나 빈칸이 나옵니다. 확인하기 쉬운 증상이 아니라 **렌더는 성공하고 글자만 깨집니다.**

빌드 때 내려받는 대신 파일을 커밋한 이유는 빌드가 외부 네트워크에 의존하지 않게 하기 위해서입니다.

## 커버리지

현대 한글 11,172 음절 전체 + Latin + 문장부호/기호(`□ ✓ • → ₩ 「」` 등).

**이모지는 없습니다.** Noto Sans KR에 이모지 글리프가 없어서 넣을 수도 없습니다. 그래서 PDF 내보내기는 콜아웃의 이모지를 `[정보]` 같은 텍스트 라벨로 바꿉니다 (`lib/template-fallback.ts`). EPUB은 리더기 폰트를 쓰므로 이모지를 그대로 둡니다.

## 다시 만들기

```bash
./scripts/build-korean-font.sh
```

두 파일의 postscript 이름이 서로 달라야 합니다. pdfkit이 임베드 폰트를 이름으로 캐시해서, 같으면 굵은 글씨가 보통 글씨로 덮입니다.

## 라이선스

SIL Open Font License 1.1 — `OFL.txt` 참조. 서브셋과 재배포가 허용되며, 폰트 자체를 판매하지 않는 한 제약이 없습니다.
