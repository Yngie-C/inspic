# Supabase·Vercel 서울 리전 이전 런북

2026-10-14 작성 · 상태: **진행 전**

## 왜 옮기나

운영 함수는 Vercel `iad1`(워싱턴), DB는 Supabase India(`ap-south-1`, 뭄바이)에 있었습니다. 장 하나를 추가하면 함수가 Supabase와 약 10번을 순서대로 왕복하는데, 그때마다 미국↔인도를 오가서(1회 약 200ms) 버튼 반응이 2초 안팎 걸렸습니다. 독자·저자가 한국에 있으므로 둘 다 서울(Vercel `icn1`, Supabase `ap-northeast-2`)로 맞춥니다.

Supabase는 프로젝트의 리전을 바꿀 수 없어서 서울에 새 프로젝트를 만듭니다.

## 정한 것

- **데이터는 옮기지 않고 새로 시작합니다.** 옛 프로젝트(`gzodwsbpnruaaapynyry`)에는 QA 계정·테스트 책과 가짜 결제로 만든 구매 1건뿐입니다. 계정은 새로 가입합니다. 본문·표지 URL에 옛 호스트가 박혀 있지만 새로 시작하므로 바꿀 것이 없습니다.
- **옛 프로젝트는 일시정지했다가 서울 쪽 확인이 끝나면 지웁니다.** 무료 플랜은 활성 프로젝트가 2개까지입니다.
- 코드는 바꾸지 않습니다. 함수 리전은 대시보드 설정으로 바꿉니다(`vercel.json`의 `regions`를 쓰면 대시보드 값을 덮으므로 한 곳만 씁니다).

## 절차

순서대로 하세요. 5번(Vercel 전환) 전까지 운영은 옛 프로젝트로 그대로 돕니다.

### 1. 서울 프로젝트 만들기

- [ ] Supabase 대시보드 → New project
  - Region: **Northeast Asia (Seoul)** (`ap-northeast-2`)
  - DB 비밀번호는 비밀번호 관리자에 저장 (2번에서 씀)
  - Data API 관련 옵션은 **기본값(켜짐) 그대로** 둡니다. 앱이 PostgREST(`supabase-js`)로만 DB에 접근합니다
- [ ] 새 project ref를 이 문서 맨 아래 "기록"에 적기

### 2. 마이그레이션 적용

SQL Editor에 붙여 넣는 방식은 09월에 `00008`의 마지막 문장이 빠진 적이 있습니다. **psql로 파일을 통째로, 에러 나면 멈추게** 적용하세요.

- [ ] 대시보드 → Connect → **Session pooler** 연결 문자열 복사 (Direct connection은 IPv6 전용이라 집 회선에서 안 될 수 있습니다)
- [ ] 저장소 루트에서 직접 실행 (비밀번호가 셸 기록에 남지 않게 프롬프트로 받습니다)

```bash
read -s "PGPASSWORD?DB 비밀번호: "; export PGPASSWORD; echo
DB_URL='<복사한 Session pooler 문자열에서 [YOUR-PASSWORD] 부분과 그 앞의 : 를 뺀 것>'
# 예: postgresql://postgres.<새 ref>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
for f in supabase/migrations/*.sql; do
  echo "== $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" || break
done
unset PGPASSWORD
```

- [ ] 11개 파일이 모두 에러 없이 끝났는지 확인
- [ ] SQL Editor에서 `TODO.md` "이후 마일스톤"의 **지문 쿼리** 실행 → 19줄 전부 `true`

### 3. Auth 설정 다시 하기

새 프로젝트는 기본값으로 시작하므로 옛 프로젝트에서 한 설정을 전부 다시 합니다.

- [ ] Authentication → URL Configuration
  - Site URL: `https://www.secrettome.com`
  - Redirect URLs: `https://www.secrettome.com/**`, `https://secrettome.com/**`, `https://publedge.vercel.app/**`, `http://localhost:3000/**`
- [ ] Authentication → Sign In / Providers → Email
  - Confirm email: 켜짐
  - 비밀번호 최소 길이 **6**, 요구 문자 **Letters and digits** (`lib/auth-errors.ts`의 `PASSWORD_MIN_LENGTH`/`checkPassword()`와 같아야 함)
- [ ] Authentication → Emails → SMTP Settings — `supabase-smtp-setup.md`의 "3단계에서 입력할 값" 표 그대로
  - Password(Resend API 키)는 옛 프로젝트에서 다시 볼 수 없습니다. Resend에서 `secrettome-supabase-smtp` 키를 새로 만들고, 옮긴 뒤 옛 키는 지웁니다
  - Resend 도메인·DNS는 그대로라 할 일이 없습니다
- [ ] Authentication → Rate Limits — 메일 발송 한도 (옛 프로젝트와 같게)
- [ ] 이메일 템플릿을 고친 적이 있으면 옮기기 (저장소에는 기록이 없습니다)

### 4. 서울 프로젝트 단독 확인 (로컬)

운영을 건드리기 전에 로컬에서 먼저 붙여 봅니다.

- [ ] `.env.local`의 Supabase 3개를 새 프로젝트 값으로 교체
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (대시보드 → Project Settings → API Keys)
- [ ] `npm run dev` → 가입 → 인증 메일 링크 → 로그인 → 책 만들기 → 장 추가 → 표지 업로드

### 5. 운영 전환 (Vercel)

여기서부터 운영이 새 프로젝트를 봅니다. 옛 계정 세션은 끊기고 모두 새로 가입해야 합니다.

- [ ] Vercel → `inspic` → Settings → Environment Variables에서 위 3개 교체
  - `NEXT_PUBLIC_*` 둘은 일반, `SUPABASE_SECRET_KEY`는 Sensitive (10-07과 같게)
- [ ] Settings → Functions → Function Region → **Seoul, South Korea (`icn1`)**
- [ ] **재배포** — `NEXT_PUBLIC_*`은 빌드 때 번들에 박히고, 리전도 다음 배포부터 적용됩니다
- [ ] 확인

```bash
curl -sI https://www.secrettome.com/api/chapters | grep -i x-vercel-id   # icn1::icn1::... 이면 함수가 서울
curl -s -o /dev/null -w "%{http_code}\n" https://www.secrettome.com/api/explore   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.secrettome.com/api/landing   # 200
```

- [ ] 운영 번들에 새 호스트가 들어갔는지 (옛 ref `gzodwsbpnruaaapynyry`가 0곳이어야 함)
- [ ] 운영에서 가입 → 인증 메일 → 로그인 → 책·장 추가. [+] 버튼 반응이 빨라졌는지 체감 확인

### 6. 나머지 연결 교체

- [ ] GitHub 시크릿 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 교체 (keep-alive가 읽음)
- [ ] `gh workflow run supabase-keepalive.yml` → 로그에 `HTTP status: 200`
- [ ] 나중에 Toss 테스트 키를 넣을 때 webhook 주소는 바뀌지 않습니다(도메인 기준)

### 7. 옛 프로젝트 정리

- [ ] 옛 프로젝트(`gzodwsbpnruaaapynyry`, 뭄바이) **일시정지**
- [ ] 며칠 운영해 보고 문제가 없으면 **삭제**
- [ ] `TODO.md`에 적힌 옛 ref를 새 ref로 바꾸기

## 기록

| 항목 | 값 |
| --- | --- |
| 새 project ref | |
| 마이그레이션 적용·지문 확인 | |
| 운영 전환(재배포) | |
| 옛 프로젝트 일시정지 | |
| 옛 프로젝트 삭제 | |
