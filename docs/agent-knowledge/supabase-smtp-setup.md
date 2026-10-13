# SecretTome 인증 메일 SMTP 설정 가이드 (Resend)

2026-10-01 작성 · 원본(공동 편집 문서): https://claude.ai/code/artifact/c7e740aa-5cd8-4838-b789-501d14f7889b

> 상태: **적용 완료 (2026-10-13).** DKIM·SPF·DMARC DNS 조회와 가입 인증 메일 수신까지 확인했습니다. Supabase Site URL은 `https://www.secrettome.com`(Vercel 정식 주소가 `www`)입니다. 도메인 `secrettome.com`은 가비아에서 샀습니다(`secrettome.co.kr`은 등록하지 않았습니다). 보내는 주소는 인증 메일 전용 서브도메인 `auth.secrettome.com`으로 정했습니다 — Supabase 권장대로, 나중에 다른 메일을 보내도 인증 메일 평판이 섞이지 않게.

## 왜 필요한가

Supabase 기본 메일 서비스로는 실제 가입자에게 인증 메일을 보낼 수 없어서 Custom SMTP를 연결해야 해요. 기본 서비스에는 두 가지 제약이 있어요([Supabase 문서](https://supabase.com/docs/guides/auth/auth-smtp)).

- **조직 팀원 주소로만 보내요.** 다른 주소는 "Email address not authorized"로 실패해요. `example+test1@gmail.com` 같은 테스트 주소도 막힐 가능성이 높아요.
- **시간당 2통까지만 보내요.** 가입 확인, 재발송, 비밀번호 재설정을 몇 번 해 보면 금방 막혀요.

Custom SMTP를 연결하면 두 제약이 모두 풀려요.

## 결정 사항

다른 프로젝트에서 쓰는 Resend 무료 팀에 `auth.secrettome.com` 도메인을 추가해요. 2026-08-25부터 Resend 무료 팀은 도메인을 3개까지 인증할 수 있어요([Resend changelog](https://resend.com/changelog/three-domains-on-the-free-tier)).

| 항목 | 내용 |
| --- | --- |
| 비용 | 무료 |
| 한도 | 하루 100통, 월 3,000통. 다른 프로젝트와 함께 써요 |
| 한도를 넘으면 | 발송이 멈추고, 자동 과금되지 않아요 |
| 보내는 주소 | `noreply@auth.secrettome.com` |

주의할 점이 두 가지 있어요.

- **한도를 나눠 써요.** 팀의 한도는 모든 도메인이 함께 써요. SecretTome 테스트로 하루 100통을 채우면 그날은 다른 프로젝트 메일도 멈춰요.
- **계정 제재는 둘 다에 걸려요.** 반송이나 스팸 신고가 많아지면 두 프로젝트 발송이 함께 막혀요. 테스트는 `+test1`처럼 실제 받은편지함으로 가는 주소로만 해요.

## 사전 준비: 자체 도메인

SMTP를 연결하기 전에 SecretTome용 도메인을 먼저 사야 해요. 메일을 보내려면 보내는 도메인에 SPF·DKIM·DMARC 레코드를 등록해 인증해야 하기 때문이에요.

- 지금 주소인 `publedge.vercel.app`은 Vercel 소유라 DNS 레코드를 추가할 수 없어요.
- Gmail 주소를 보내는 사람으로 쓰면 스팸함으로 가기 쉽아요.
- Supabase는 인증 메일 전용 도메인을 따로 두는 것도 권해요. 그래서 `auth.secrettome.com`을 써요.

## 설정 절차

1. **Resend에 도메인 추가**
   - 기존 팀의 Domains 화면에서 `auth.secrettome.com`을 추가해요. 리전은 Tokyo(ap-northeast-1)예요.
   - Resend가 알려 주는 DNS 레코드를 가비아 DNS 설정에 그대로 등록해요. 2026-10 기준 Resend는 DKIM TXT 1개(`resend._domainkey.auth`)와 SPF용 CNAME 2개(`rsend.auth`, `send.auth`)를 줘요. 예전처럼 `send`에 MX·TXT를 넣는 방식이 아니에요.
   - 가비아 호스트 칸에는 도메인 앞부분만 넣어요(`rsend.auth`). 뒤에 `.secrettome.com`이 자동으로 붙어요.
   - 가비아에서 CNAME이 저장되지 않으면 값 끝에 점을 붙여 보세요(`send.forge.rmta.net.`). 같은 호스트에 다른 레코드(예전 방식의 MX·TXT)가 있어도 CNAME은 들어가지 않아요.
   - DMARC도 하나 넣어요: TXT `_dmarc` = `v=DMARC1; p=none;`. Gmail 수신율에 영향이 있어요.
   - 도메인 설정에서 Click tracking·Open tracking은 꺼요. 클릭 추적은 인증 링크를 Resend 주소로 바꿔요.
   - Resend 화면에서 상태가 Verified로 바뀔 때까지 기다려요.
2. **SecretTome 전용 API 키 만들기**
   - API Keys 화면에서 새 키를 만들고, 이름을 `secrettome-supabase-smtp`처럼 붙여요.
   - 권한은 Sending access로 하고, 가능하면 `auth.secrettome.com` 도메인으로만 보내게 제한해요.
   - 다른 프로젝트의 키를 같이 쓰지 않아요. 따로 두어야 한쪽만 끊거나 바꾸기 쉽아요.
3. **Supabase에 SMTP 입력**
   - Authentication → Emails → SMTP Settings에서 Custom SMTP를 켜요.
   - 아래 표대로 입력하고 저장해요.
4. **발송 한도 올리기**
   - Custom SMTP를 연결하면 Supabase가 처음에 시간당 30통으로 막아 둬요.
   - Authentication → Rate Limits에서 필요한 만큼 올려요. Resend 무료 한도가 하루 100통이라 그보다 높게 올려도 의미가 없어요.
5. **Redirect URLs 확인**
   - Vercel에 `secrettome.com`을 연결한 뒤, Authentication → URL Configuration의 Site URL을 `https://secrettome.com`으로 바꿔요.
   - Redirect URLs에는 `https://secrettome.com/**`, `https://publedge.vercel.app/**`(옮기는 동안), `http://localhost:3000/**`를 넣어요. `/**`라서 `?next=/auth/reset-password` 같은 쿼리도 통과해요.
   - 코드는 고칠 것이 없어요. 메일 링크는 `window.location.origin`으로 만들어요(`stores/auth-store.ts`).

**3단계에서 입력할 값**

| Supabase 항목 | 값 |
| --- | --- |
| Sender email | `noreply@auth.secrettome.com` |
| Sender name | `SecretTome` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | 2단계에서 만든 API 키 |

SMTP 값은 2026-10-12에 [Resend의 Supabase 안내](https://resend.com/docs/send-with-supabase-smtp)와 대조했어요.

## 설정 후 확인

DNS는 터미널에서 먼저 확인해요.

```bash
dig +short TXT resend._domainkey.auth.secrettome.com @8.8.8.8   # DKIM 공개키
dig +short CNAME rsend.auth.secrettome.com @8.8.8.8             # rsend-apne1.forge.rmta.net.
dig +short CNAME send.auth.secrettome.com @8.8.8.8              # send.forge.rmta.net.
dig +short TXT _dmarc.secrettome.com @8.8.8.8                   # v=DMARC1; p=none;
```

테스트 계정은 `example+test1@gmail.com`처럼 `@` 앞에 `+텍스트`를 붙여 만들어요. 모두 같은 Gmail 받은편지함으로 와요.

- [ ] 새 주소로 가입 → 인증 메일이 받은편지함(스팸함 아님)에 오는지
- [ ] 보낸 사람이 `SecretTome <noreply@auth.secrettome.com>`으로 보이는지
- [ ] Gmail ⋮ → 원본 보기에서 SPF·DKIM·DMARC가 모두 PASS인지 — 연결을 판정하는 가장 확실한 기준이에요
- [ ] 메일의 링크를 누르면 `/auth/callback`을 거쳐 로그인된 상태가 되는지
- [ ] 인증 전 계정으로 로그인 → "인증 메일 다시 보내기"로 메일이 다시 오는지
- [ ] 비밀번호 찾기 → 메일 링크 → `/auth/reset-password`에서 변경 → 새 비밀번호로 로그인
- [ ] Resend 대시보드의 Emails 화면에 발송 기록이 남는지

메일이 오지 않으면 Resend의 Emails 화면에서 먼저 찾아봐요. 기록이 없으면 Supabase SMTP 설정 문제이고, 기록이 있으면 받는 쪽(스팸함·DNS 인증) 문제예요.

## 대안

한도를 나눠 쓰는 것이 문제가 되면 아래로 옮겨요. Supabase 쪽은 SMTP 값만 바꾸면 되고, 코드는 그대로예요.

| 방법 | 비용 | 한도 | 이럴 때 |
| --- | --- | --- | --- |
| [Brevo](https://www.brevo.com/free-smtp-server) 무료 | 무료 | 하루 300통, 따로 씀 | 프로젝트를 완전히 떼고 싶을 때. 메일에 "Sent with Brevo"가 붙어요 |
| Resend Pro | 월 $20 안팎 | 월 50,000통 | 한쪽 발송량이 커졌을 때 |
| Amazon SES | 1,000통당 $0.16 | 사실상 무제한 | 발송량이 많아져 비용을 줄여야 할 때. 설정이 가장 번거로워요 |

가격은 2026-10-01에 조사했고 대부분 제3자 리뷰에서 가져왔어요. 결제 전에 공식 가격 페이지에서 다시 확인해 주세요.

## 출처

- [Supabase Docs — Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Docs — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Resend changelog — Three domains on the free tier](https://resend.com/changelog/three-domains-on-the-free-tier)
- [Resend — Multiple Teams](https://www.resend.com/blog/multiple-teams)
- [Resend free tier explained 2026 (automationatlas)](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [Brevo free SMTP server](https://www.brevo.com/free-smtp-server)
- [Amazon SES pricing plans in 2026 (dev.to)](https://dev.to/mr_manushukla/amazon-ses-pricing-plans-in-2026-essentials-vs-pro-vs-enterprise-and-when-a-la-carte-still-wins-1ohg)
