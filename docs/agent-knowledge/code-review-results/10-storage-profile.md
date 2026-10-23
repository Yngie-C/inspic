# 10단계 리뷰 결과 — Storage·프로필·마이그레이션 00012~00014

- 날짜: 2026-10-23
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review-2-storage`):
  ```
  /code-review high supabase/migrations/00012_book_audience.sql supabase/migrations/00013_book_detail_image.sql supabase/migrations/00014_author_profile.sql
  /code-review high src/lib/book-image-route.ts
  /code-review high src/app/api/books/[bookId]/cover src/app/api/books/[bookId]/detail-image
  /code-review high src/app/api/my
  /code-review high src/lib/storage-cleanup.ts src/lib/storage-image.ts next.config.ts
  /code-review high src/app/api/authors
  ```
- 대상 커밋: `ab6ba02` (여섯 경로 모두 브랜치 diff가 없어 파일 전체를 검토)
- 원 지적 53건(마이그레이션 7 · book-image-route 10 · cover/detail-image 10 · my 10 · storage 9 · authors 7). 경로가 겹쳐 같은 원인이 두 번 나온 10건을 합쳐 **43건 (P0 0 · P1 22 · P2 21)**.
  - cover/detail-image 리뷰는 두 라우트가 설정만 넘기고 `bookImageHandlers()`를 부르므로 지적 10건 중 9건이 book-image-route 리뷰와 같음(행 갱신 경쟁, alt 남음, 실패 문구, 파일명 충돌, 책 삭제 중 업로드, 파일명 앞머리, 행 전체 select, `updated_at` 중복·죽은 조건, 테스트 없음). 아바타 라우트 중복 구현(book-image-route 9 · my 9)도 하나로 셈.
- **검증 상태**
  - 직접 대조함: P1-1·P1-2(00013·00014에 CHECK·트리거 없음, 주석이 "라우트만 검사"라고 밝힘), P1-4(`rls.test.ts`의 avatars 블록에 UPDATE 케이스 없음), P1-5(`book-image-route.ts:103` 갱신에 옛 값 조건 없음), P1-6(`avatar/route.ts:45`·`:65` 같은 구조), P1-7(`:141`이 `[column]`만 비움), P1-8(`:139` DELETE 갱신에 `.select()` 없음), P1-9(`avatar/route.ts:65`·`:95`), P1-13(`coverStoragePath`가 폴더만 봄), P1-14(`publicObjectPath`가 origin을 안 봄), P1-15(`removeBookFiles`가 행의 URL 두 개만 지움), P1-18(파일마다 `like` 한 번), P1-22(`authors` 라우트가 프로필만 있으면 200), P2-3(`:52` `uploadFailed`), P2-4(`:86` `Date.now()`), P2-15(`workbooks/route.ts:29` 영어 문구)는 코드와 위치를 확인했어요.
  - 나머지는 리뷰 출력 그대로이고, 테스트·앱 확인은 하지 않았어요. P1-3은 운영 DB의 `storage.objects` 정책 목록을 봐야 실제 문제인지 알 수 있어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [09-reader-responses.md](09-reader-responses.md)를 보세요.

## 공통 원인 네 가지

1. **"업로드 라우트로만 바꾼다"를 앱만 지킨다.** `detail_image_url`·`avatar_url`(그리고 같은 구조인 `cover_image_url`)은 책 PUT·프로필 PUT이 거절할 뿐, 기존 소유자 UPDATE 정책이 그대로 열려 있어요. anon 키로 PostgREST를 직접 부르면 아무 외부 URL이나 들어가고, 공개 책 상세·저자 페이지가 그것을 `<img>`로 그려요(P1-1·P1-2). `bio` 80자도 같아요(P2-1).
2. **읽어 둔 값으로 판단하고, 쓴 결과를 확인하지 않는다.** 옛 URL을 먼저 읽고 조건 없이 덮어써서 요청이 겹치면 아무도 가리키지 않는 파일이 공개 버킷에 남아요(P1-5·P1-6). 갱신이 0행이어도, Storage `remove()`가 빈 결과를 돌려줘도 성공으로 넘겨요(P1-8·P1-9·P1-16). 결과를 모르는 갱신 실패에 새 파일을 지워 행이 지워진 파일을 가리킬 수 있어요(P1-10).
3. **공개 버킷의 파일은 행이 가리킬 때만 지운다.** 책 삭제는 행의 URL 두 개만, 계정 삭제는 아무것도 지우지 않아요(P1-15·P1-19). 행이 놓친 파일은 정책상 더는 누구도 지울 수 없는 채로 공개 URL에 남아요(P1-11).
4. **같은 판정·흐름을 두 벌 둔다.** 업로드 → 행 교체 → 옛 파일 삭제가 책 이미지·아바타 두 벌(P2-8), "우리 Storage URL인가"가 `publicObjectPath`·`isStorageImageUrl`·`next.config.ts` 세 벌(P1-14·P2-9), "공개 책만"이 explore·landing·authors 세 벌(P2-17)이에요. 위 1·2의 버그를 고칠 때 한쪽만 고쳐지는 원인이에요.

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `00013_book_detail_image.sql:21` | `detail_image_url`이 DB에서 막히지 않음. `books_update_own`이 소유자에게 열려 있어 `PATCH /rest/v1/books {detail_image_url:'https://tracker.example/p.gif'}`가 그대로 들어가고, 공개 책 상세가 방문자마다 그 이미지를 불러옴. `cover_image_url`도 같은 구조(00010). |
| P1-2 | `00014_author_profile.sql:10` | `avatar_url`도 같음. `user_profiles_update_own`으로 외부 URL·남의 avatars 파일 URL을 넣을 수 있고, 저자 페이지(`unoptimized`)와 OpenGraph 이미지에 실림. 마이그레이션 머리말이 없앴다고 한 경우가 그대로 남음. |
| P1-3 | `00014_author_profile.sql:50` | 우리가 만든 `avatars_*_own` 네 개만 지움. 대시보드·Supabase 스타터가 다른 이름으로 만든 avatars 정책("Anyone can upload an avatar." 등)이 있으면 OR로 합쳐져 남의 폴더 업로드·목록 조회가 열림. 00010은 covers의 대시보드 상태를 확인했고 00014는 안 함. |
| P1-4 | `00014_author_profile.sql:69` | `avatars_update_own`에 `rls.test.ts` 케이스가 없음(INSERT·DELETE·SELECT만). Storage의 move·upsert가 UPDATE를 타므로 WITH CHECK가 틀려도 남의 폴더로 옮기는 것을 아무 테스트도 못 잡음. AGENTS.md "통과·차단 케이스를 함께" 위반. |
| P1-5 | `book-image-route.ts:103` | 책 행 갱신에 읽어 둔 옛 URL 조건이 없음 → POST 두 개가 같은 옛 값 X를 읽으면 a로 바꾼 뒤 b로 바꾸고 둘 다 X를 지워, a가 행도 정리 대상도 아닌 채 공개 URL에 영구히 남음. POST·DELETE가 겹쳐도 같음. |
| P1-6 | `api/my/avatar/route.ts:45` | 아바타도 같은 경쟁. 사용자가 나중에 "사진 지우기"를 눌러도 경쟁에서 남은 옛 사진은 공개 URL로 계속 열림 — 지웠다고 믿는 사람의 사진이 남는 개인정보 문제. |
| P1-7 | `book-image-route.ts:141` | 소개 이미지 DELETE가 `detail_image_url`만 비우고 `detail_image_alt`는 남김 → 다음에 올린 다른 이미지 B에 A의 대체 글이 붙어 화면 낭독기가 틀린 내용을 읽음. 폼은 alt 칸을 숨긴 채 그 값을 다음 저장에 다시 실음. POST(교체)도 alt를 그대로 둠. |
| P1-8 | `book-image-route.ts:139` | DELETE 갱신에 `.select()`가 없어 0행이 바뀌어도 파일을 지우고 `{deleted:true}` → 행이 남아 있으면 지워진 파일을 가리켜 이미지가 깨짐. POST는 `.single()`로 0행을 잡는데 DELETE만 빠짐. |
| P1-9 | `api/my/avatar/route.ts:65` | 아바타 POST·DELETE(95행)도 0행 확인이 없음. 형제 라우트 `profile/route.ts`는 같은 경우를 500으로 냄("조용히 성공으로 내면 저장된 줄 압니다"). |
| P1-10 | `api/my/avatar/route.ts:70` | 갱신 에러가 "커밋됐는데 응답만 잃은" 경우일 수 있는데 새 파일을 지움 → 프로필이 지워진 파일을 가리키고 옛 파일은 고아. `book-image-route.ts:112`도 같은 구조. AGENTS.md 결제 쪽 "결과를 모르면 실패로 단정하지 않는다"와 같은 함정. |
| P1-11 | `book-image-route.ts:112` | 업로드 중 같은 저자가 책을 지우면 갱신이 PGRST116으로 실패하고, 롤백 삭제는 사용자 클라이언트라 `covers_delete_own`(`is_book_owner` = false)에 막힘. 정책 거절은 에러가 아니라 0건이라 로그도 없음. 지운 책의 파일이 공개 URL로 영구히 남음. |
| P1-12 | `book-image-route.ts:32`, `api/books/[bookId]/detail-image/route.ts:7` | 공유 핸들러에 순서 규칙(갱신 실패 시 새 파일 삭제 · 성공 뒤에만 옛 파일 삭제 · DELETE 실패 시 행 유지) 테스트가 없고, 소개 이미지 라우트는 테스트 자체가 없음. `cover-route.test.ts`는 `filePrefix ''`만 거침. 5-P1-7 회귀가 초록불로 나감. |
| P1-13 | `storage-cleanup.ts:53` | `coverStoragePath`가 `covers/{bookId}/` 폴더만 보고 파일명 앞머리(표지 `''`, 소개 이미지 `detail-`)는 안 봄 → `cover_image_url`이 예전 자유 입력으로 `detail-*.png`을 가리키면 표지 교체가 소개 이미지 파일을 지움. 반대도 같음. |
| P1-14 | `storage-cleanup.ts:31` | `publicObjectPath`가 origin을 안 보고 pathname 어디서든 marker를 찾음 → `https://other.example/x/storage/v1/object/public/covers/covers/{bookId}/detail-1.png` 같은 외부 URL이 우리 Storage의 같은 경로 파일을 지움. `isStorageImageUrl`은 origin을 대조해 기준이 갈림. |
| P1-15 | `storage-cleanup.ts:179` | 책 삭제가 covers에서 행의 URL 두 개만 지우고 `covers/{bookId}/` 폴더는 안 훑음 → 예전 교체 때 삭제가 실패해 남은 파일, P1-5·P1-11로 남은 파일이 책이 사라진 뒤 누구도 못 지우는 공개 파일로 남음. `chapter-images`는 폴더를 list해서 지움. |
| P1-16 | `storage-cleanup.ts:76` | `storage.remove()`는 정책이 막거나 파일이 없으면 error 없이 빈 `data`를 돌려줌. `error`만 봐서 삭제 안 된 것을 성공으로 넘김(92·159행도 같음) → "로그로 찾을 수 있다"는 전제가 깨지고 고아 파일이 소리 없이 쌓임. |
| P1-17 | `storage-cleanup.ts:146` | 본문 이미지 참조 검사가 DB에 저장된 본문만 보고 검사·삭제 사이에 잠금이 없음 → 장 X의 이미지를 장 Y에 붙여 넣고 Y의 자동 저장 전에 X를 지우면 그 파일이 지워지고 Y는 저장 뒤 깨진 이미지를 가짐. |
| P1-18 | `storage-cleanup.ts:149` | 파일마다 `chapters` 전체(모든 책)에 인덱스 없는 `'%...%'` LIKE를 직렬로 돌리고, 장·책 DELETE 응답이 그것을 기다림 → 이미지 300장 책이면 전 테이블 스캔 300번. 한 번이라도 시간 초과면 throw로 이미 판정한 파일까지 하나도 안 지움. |
| P1-19 | `00014_author_profile.sql:28` | 계정을 지우면 `user_profiles`는 CASCADE로 사라지지만 `avatars/{userId}/` 파일은 남아 공개 URL로 계속 열림. 가리키는 행이 없어 어떤 정리 경로도 못 찾음. |
| P1-20 | `api/my/workbooks/route.ts:72` | 접근을 잃은 책(구매 취소·환불, 무료 → 유료)이 목록에 남음. books는 공개라 보이지만 `workbook_blocks`는 `has_book_access`로 숨어 0/0으로 그려짐 → 답이 없던 것처럼 보이고 PDF 버튼은 `loadExportSource`에서 실패. |
| P1-21 | `api/my/workbooks/route.ts:59` | 저자가 자기 책 미리보기에서 넣은 입력이 실제 응답 행이라 자기 책이 "내 워크북"에 뜸. `workbook_response_stats()`는 같은 이유로 소유자를 뺌(00004). 55행 주석("읽을 수 없는 책이라 목록에 띄우지 않습니다")도 소유자·구매자에게 초안·비공개 책이 보이는 것을 빠뜨림. |
| P1-22 | `api/authors/[userId]/route.ts:34` | 책을 낸 적 없는 독자도 200. 가입 때 이름을 안 넣었으면 `display_name`이 이메일 앞부분(`handle_new_user()`, 00001)이라 `/author/<아무 user id>`가 그 사람을 책 0권 저자로, 이메일 앞부분과 함께 보여 줌. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `00014_author_profile.sql:8` | `bio` 80자가 라우트에만 있음. 예전 긴 bio 때문에 CHECK를 안 걸었다고 적었지만 `CHECK ... NOT VALID`면 새 쓰기만 막음. 랜딩·탐색 카드가 한 줄로 쓰는 필드. |
| P2-2 | `00013_book_detail_image.sql:8` | 소개 이미지가 covers 버킷의 5MB·JPEG/PNG/WebP를 물려받음. 세로로 긴 서점식 상세 이미지(860×15000, 6~10MB)가 라우트·버킷 양쪽에서 막힘. 한 버킷이라 표지와 따로 정할 수 없음. |
| P2-3 | `book-image-route.ts:52` | `loadOwnedBook`의 조회 실패 문구가 POST용 `uploadFailed` 고정 → 표지 삭제 중 조회가 실패하면 "표지를 올리지 못했어요". 아바타 라우트는 호출마다 문구를 받음. |
| P2-4 | `book-image-route.ts:86` | 파일명이 `Date.now()`뿐, `upsert:false` → 같은 ms의 두 요청 중 하나가 409 중복으로 500 "잠시 뒤 다시 시도". 본문 이미지는 `nanoid(16)`. |
| P2-5 | `api/my/avatar/route.ts:51` | 아바타 파일명도 같음. |
| P2-6 | `book-image-route.ts:107` | `.select()`로 책 행 전체를 돌려받아 응답에 실음. 유일한 호출자 `ImageUploadField`는 `json.data[column]`만 읽음. |
| P2-7 | `book-image-route.ts:105` | `updated_at`을 앱에서 넣지만 `set_books_updated_at` 트리거(00001)가 덮음(105·141행, 아바타도 같음). 116행 `book.imageUrl !== imageUrl`은 새 경로가 늘 유일해 항상 참. |
| P2-8 | `api/my/avatar/route.ts:14` | 업로드 → 행 교체 → 옛 파일 삭제와 롤백을 `bookImageHandlers()` 밖에서 다시 구현, `ALLOWED_IMAGE_TYPES`도 복사. P1-5~P1-10을 두 곳에서 고쳐야 함. |
| P2-9 | `storage-image.ts:9` | `isStorageImageUrl`과 `next.config.ts`의 `storageImagePatterns`가 "같은 판정"을 주석으로만 약속하고 따로 구현(프로토콜·포트 처리 다름). 한쪽만 바뀌면 next/image가 넘긴 URL을 서버가 거절. |
| P2-10 | `storage-cleanup.ts:178` | 책 삭제 한 번에 admin 클라이언트 2개, covers `remove` 2번, 장 폴더 list 직렬. |
| P2-11 | `next.config.ts:35` | Next 16은 `images.dangerouslyAllowLocalIP` 기본 false인데 `isStorageImageUrl`은 로컬 Supabase(127.0.0.1)도 최적화 대상으로 봄 → 로컬 개발에서 표지·저자 사진이 전부 깨짐. 이 워크트리에 `node_modules`가 없어 설치본으로는 확인 못 함. |
| P2-12 | `next.config.ts:34` | `DEV_ORIGINS`를 `split(',')`만 하고 `trim` 안 함 → `'a, b'`의 두 번째 값이 안 맞음. |
| P2-13 | `api/my/workbooks/route.ts:117` | `books.map` 안에서 `responses.filter` → 책 수 × 응답 수. `fieldsByBook`처럼 Map으로 한 번 묶기. |
| P2-14 | `api/my/workbooks/route.ts:40` | 개수·최근 시각을 내려고 모든 응답의 `value_text`를 내려받음. |
| P2-15 | `api/my/workbooks/route.ts:29` | 에러 문구가 영어("Authentication required", "Failed to fetch ..."). 형제 라우트는 한국어. |
| P2-16 | `api/authors/[userId]/route.ts:36` | 프로필·책 조회를 차례로 기다림. 서로 기대지 않음 → `Promise.all`. |
| P2-17 | `api/authors/[userId]/route.ts:36` | "공개 책만" 필터가 explore(`author_id`)·landing·authors 세 벌. 산 독자에게 비공개 책이 보이는 RLS 때문에 목록이 직접 걸러야 하는 규칙이 갈릴 수 있음. |
| P2-18 | `api/authors/[userId]/authors-route.test.ts:61` | `eq` 필터만 보고 `.order("id")`·`.range()`는 안 봄 → 빠져도 초록불. |
| P2-19 | `api/authors/[userId]/route.ts:22` | 공개 화면인데 쿠키 세션 클라이언트라 보는 사람마다 결과가 다름(그래서 손 필터가 필요). anon 조회면 같고 캐시 가능. |
| P2-20 | `api/authors/[userId]/route.ts:39` | 책마다 `owner_id`를 싣지만 늘 URL의 `userId`. |
| P2-21 | `api/authors/[userId]/route.ts:36` | 저자의 공개 책 전체를 페이지 없이 한 응답에. |

## 수정 묶음

순서는 A → B → C → D. 한 묶음 = 한 PR. B와 C는 `storage-cleanup.ts`를 함께 만지므로 B를 먼저 병합하고 C를 그 위에서 시작해요.

| 묶음 | 지적 | 비고 |
|---|---|---|
| A. DB가 지키게 | P1-1~4, P2-1 | 새 마이그레이션 `00015`. 외부 URL이 공개 화면에 박히는 P1-1·P1-2가 이번 단계에서 가장 급함. P1-3은 운영 DB 확인 먼저. |
| B. 이미지 교체 흐름 한 벌 | P1-5~12, P2-3~8 | `book-image-route.ts`·`avatar/route.ts`를 공용 헬퍼 하나로. 경쟁·0행·결과 모름·alt·테스트. |
| C. Storage 정리 | P1-13~19, P2-9~12 | `storage-cleanup.ts`·`storage-image.ts`·`next.config.ts`. 폴더 단위 정리와 "우리 URL인가" 한 벌. |
| D. 읽기 API | P1-20~22, P2-13~21 | `api/my/workbooks`·`api/authors`. P1-20·P1-22는 결정 필요. P2-14·P2-19·P2-21은 보류 후보. |

### 묶음 A 계획 — DB가 지키게

**1. 이미지 URL 컬럼 잠그기 (P1-1·P1-2)** — `00015_image_url_guards.sql`. BEFORE UPDATE 트리거로 `authenticated` 역할이 `books.cover_image_url`·`books.detail_image_url`·`user_profiles.avatar_url`을 **바꾸면** 거절(42501). 업로드 라우트는 소유자 확인을 이미 한 뒤이므로 그 한 컬럼 갱신만 `createAdminClient()`로. 방식은 아래 "결정이 필요한 것" 1.
  - 다른 컬럼만 바꾸는 갱신은 그대로 통과(`NEW.col IS NOT DISTINCT FROM OLD.col`).
  - INSERT도 막음 — 새 책·새 프로필 행이 처음부터 외부 URL을 들고 오지 못하게(`handle_new_user()`는 `user_id`·`display_name`만 넣어 영향 없음).

**2. `bio` 길이 (P2-1)** — 같은 마이그레이션에 `CHECK (bio IS NULL OR char_length(bio) <= 80) NOT VALID`. 기존 긴 bio는 남고 그 행을 고칠 때부터 걸림. 프로필 PUT은 이미 80자를 막으므로 화면 동작은 그대로.

**3. 남은 avatars 정책 (P1-3)** — 먼저 운영 DB에서 확인:
  ```sql
  SELECT policyname, cmd, qual, with_check FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects';
  ```
  우리 네 개 말고 `'avatars'`를 언급하는 정책이 있으면 `00015`에 `DO $$ ... $$` 블록으로 지움(이름을 하드코딩하지 않고 `pg_policies`에서 `avatars`를 언급하면서 `avatars_*_own`이 아닌 것). 없으면 같은 블록을 방어로 두고 결과를 이 문서에 적음.

**4. 테스트**
  - `rls.test.ts` avatars: UPDATE로 내 폴더 안 이름 바꾸기 통과 · 남의 폴더로 옮기기 차단 · 남의 파일 UPDATE 차단(P1-4).
  - `rls.test.ts`(또는 `schema.test.ts`): `asUser`로 세 URL 컬럼 UPDATE 차단, 같은 행의 다른 컬럼(`title`, `bio`) UPDATE 통과, 테이블 소유자 연결은 통과(admin 경로 대용).
  - `schema.test.ts`: `bio` 81자 새 쓰기 거절, 기존 81자 행은 남음.

**5. 확인** — `npm run typecheck && npm test && npm run lint`(에러 9개 이하), `npm run build`. 운영 적용 뒤 표지·소개 이미지·아바타 업로드를 실제로 한 번씩.

### 묶음 B 계획 — 이미지 교체 흐름 한 벌

**1. 공용 헬퍼 (P2-8)** — `lib/stored-image.ts`에 `replaceStoredImage()`·`clearStoredImage()`. 받는 것: 버킷, 새 경로, 행 갱신 함수(조건부), 파일 삭제 함수, 문구. `book-image-route.ts`와 `avatar/route.ts`는 설정만 넘김. `ALLOWED_IMAGE_TYPES`는 한 곳에서 export.

**2. 조건부 교체 (P1-5·P1-6·P1-8·P1-9)** — 갱신에 읽어 둔 옛 값을 조건으로(`.eq(column, old)`, 비었으면 `.is(column, null)`) 걸고 `.select("id").maybeSingle()`로 바뀐 행을 확인.
  - 0행이면 그 사이 다른 요청이 바꾼 것 → 방금 올린 파일을 지우고 409 "다른 곳에서 먼저 바뀌었어요. 다시 시도해 주세요."
  - DELETE도 같은 조건부 갱신. 0행이면 파일을 지우지 않음.

**3. 결과를 모르는 갱신 (P1-10)** — 갱신이 에러면 행을 다시 읽음. 새 URL을 가리키면 성공으로 마무리(옛 파일 삭제), 아니면 새 파일 삭제, 다시 읽기도 실패하면 새 파일을 지우지 않고 500 + 로그(고아가 생겨도 C의 폴더 정리가 책 삭제 때 거둠).

**4. 롤백은 admin으로 (P1-11)** — 소유자 확인을 마친 요청이 자기가 올린 그 경로를 지우는 것이므로 롤백 삭제만 `createAdminClient()`. 책이 그 사이 지워져도 파일이 남지 않음.

**5. 소개 이미지 대체 글 (P1-7)** — `detail_image_url` DELETE는 `detail_image_alt`도 null. 교체(POST)에서도 비울지는 결정 2. 폼은 응답을 받으면 alt 상태를 서버 값으로 맞춤.

**6. 정리 (P2-3~7)** — 조회 실패 문구를 호출마다(POST "올리지", DELETE "지우지"). 파일명에 `crypto.randomUUID()` 붙이기(표지 `covers/{bookId}/{prefix}{uuid}.{ext}`, 아바타 `{userId}/{uuid}.{ext}`). `.select()` 전체 → 컬럼 하나. `updated_at` 앱 대입과 116행 죽은 조건 삭제(`user_profiles`에도 `set_user_profiles_updated_at` 트리거가 있어 아바타도 같이).

**7. 테스트 (P1-12)** — 헬퍼 단위 테스트(Supabase 클라이언트 모의):
  - 갱신 성공 → 옛 파일 삭제, 새 파일 유지. 갱신 0행 → 새 파일 삭제·409·옛 파일 유지(P1-5, 예전 코드에서 실패해야 함).
  - 갱신 에러 + 다시 읽기가 새 URL → 성공(P1-10). DELETE 0행 → 파일 삭제 안 함(P1-8).
  - 소개 이미지 라우트: `detail-` 앞머리 경로, `detail_image_url` 컬럼, DELETE가 alt도 비움.

**8. 확인** — 묶음 A와 같음.

### 묶음 C 계획 — Storage 정리

**1. "우리 Storage URL인가" 한 벌 (P1-14·P2-9·P2-11)** — `lib/storage-image.ts`에 `storageImageBase()`(환경변수 → origin·경로 접두사)를 두고 `publicObjectPath`·`isStorageImageUrl`·`next.config.ts`가 함께 씀. `publicObjectPath`는 origin이 다르면 null. 로컬 호스트(127.0.0.1·localhost)면 `isStorageImageUrl`이 false를 돌려 `unoptimized`로.

**2. 파일명 앞머리 (P1-13)** — `coverStoragePath(url, bookId, kind)`에서 `kind: "cover"`면 `detail-`로 시작하는 파일을 거절, `"detail"`이면 `detail-`만 받음.

**3. 책 폴더 통째 정리 (P1-15·P2-10)** — `removeBookFiles`가 행 URL 대신 `covers/{bookId}/`를 list해서 전부 지움(admin 하나, `remove([...paths])` 한 번, 장 폴더 list는 `Promise.all`).

**4. 삭제 결과 확인 (P1-16)** — `remove()`의 `data` 길이가 요청 수보다 적으면 빠진 경로를 로그로.

**5. 본문 이미지 참조 검사 (P1-17·P1-18)** — 파일마다 LIKE 대신 `%/chapter-images/{bookId}/%`로 한 번 읽고 JS에서 경로 대조(장 삭제면 그 책 안만 보면 됨 — 경로가 책 폴더 아래). 라우트에서는 `after()`로 응답 뒤에. 붙여 넣기 경쟁(P1-17)을 어디까지 막을지는 결정 3.

**6. 계정 삭제 (P1-19)** — 결정 4.

**7. `DEV_ORIGINS` trim (P2-12)**.

**8. 테스트** — `storage-cleanup` 단위 테스트: 외부 origin URL은 null, 표지 kind가 `detail-` 파일 거절, `removeBookFiles`가 행에 없는 폴더 파일까지 지움, 본문 이미지 판정이 쿼리 한 번.

### 묶음 D 계획 — 읽기 API

**1. 내 워크북 (P1-20·P1-21·P2-13·P2-15)** — `owner_id === user.id`인 책 제외, 접근을 잃은 책 처리는 결정 5. 응답을 `book_id` Map으로 한 번 묶기. 에러 문구 한국어로. 55행 주석 고치기.

**2. 저자 API (P1-22·P2-16~18·P2-20)** — 공개 책이 없는 계정의 처리는 결정 6. 프로필·책 조회 `Promise.all`. "공개 책" 조건을 `lib/public-books.ts`의 `wherePublicBook(query)` 하나로 explore·landing·authors가 함께 씀. 테스트에 `.order("id")`·`.range()` 확인 추가. `owner_id` 빼기(`AuthorBook` 타입 함께).

**3. 보류** — P2-14(답 개수를 SQL로), P2-19(anon 클라이언트), P2-21(저자 책 페이지). 지금 규모에서 체감 문제가 없고, P2-14는 `isAnswered()` 판정을 SQL에 한 벌 더 두게 돼 AGENTS.md "답했다의 판정은 한 곳"과 부딪힘. 실제 느려지면 다시.

## 결정이 필요한 것

1. **URL 컬럼 잠그는 방식 (묶음 A).** 트리거로 `authenticated`의 변경을 거절하고 라우트는 admin으로 쓰는 방안을 권장해요. 비교한 것:
   - 컬럼 권한 회수(`REVOKE UPDATE ON books` + 나머지 컬럼만 `GRANT`): 컬럼을 새로 더할 때마다 GRANT 목록을 고쳐야 하고, 빠뜨리면 저자 저장이 조용히 막혀요.
   - CHECK로 URL 모양 검사: Supabase 호스트가 환경마다 달라 DB가 알 수 없고, 경로만 보면 같은 경로를 흉내 낸 외부 호스트가 통과해요.
   - SECURITY DEFINER RPC로만 쓰기: 트리거와 효과는 같지만 RPC 세 개와 권한 설정이 더 늘어요.
2. **소개 이미지를 교체할 때 대체 글도 비울지 (P1-7).** 비우는 쪽을 권장해요. 다른 이미지에 옛 설명이 붙는 것이 같은 이미지를 다시 올려 설명을 한 번 더 쓰는 것보다 나빠요. 폼에서 교체 직후 "대체 글을 다시 적어 주세요"를 보여 줘요.
3. **본문 이미지 붙여 넣기 경쟁 (P1-17).** 완전히 막으려면 삭제를 미루는 장치(예: 지울 후보를 표에 넣고 하루 뒤 다시 검사)가 필요해요. 이번에는 `after()`로 응답 뒤에 돌리기만 하고(그사이 자동 저장이 끝날 여지가 생김), 지연 삭제는 운영에서 깨진 이미지가 실제로 보고되면 하는 방안을 권장해요.
4. **계정 삭제 시 아바타 (P1-19).** 앱에 계정 삭제 경로가 아직 없어요(대시보드에서만 지움). 지금은 운영 절차(`docs/agent-knowledge/`에 "사용자를 지우기 전에 `avatars/{userId}/`를 비운다")로 두고, 계정 삭제 기능을 만들 때 라우트에서 지우는 방안을 권장해요. SQL 트리거로 `storage.objects` 행을 지우는 것은 실제 파일이 남아 쓰지 않아요.
5. **접근을 잃은 책의 답 (P1-20).** 목록에서 숨기면 독자가 쓴 답을 볼 길이 없어지고, 0/0으로 두면 답이 사라진 것처럼 보여요. "지금 열 수 없는 책"으로 따로 보여 주고 답 수는 응답 행으로 세는(정의를 못 읽어도 `isAnswered()`로 셀 수 있음) 방안을 권장해요. PDF 버튼은 숨겨요.
6. **책 없는 계정의 저자 페이지 (P1-22).** 공개 책이 하나도 없으면 404를 권장해요. 단 본인이 자기 페이지를 볼 때는 열어서 "책을 공개하면 이 페이지가 독자에게 보여요"를 보여 줘요. 이메일 앞부분 기본 이름은 이 문제와 별개로 남는데, 가입 화면에서 이름을 받는 것은 이번 범위 밖으로 둬요.
7. **소개 이미지 크기 (P2-2).** 5MB를 유지하고 화면에 "5MB 이하" 안내를 두는 방안을 권장해요. 늘리려면 별도 버킷이 필요하고, 00013이 정한 "covers를 그대로 쓴다"를 뒤집어요.
