/** 로그인 뒤 이 리더로 돌아오는 주소. 리더 상단 안내와 블록 안내가 함께 씁니다. */
export function loginHref(bookId: string) {
  return `/auth/login?redirect=/reader/${bookId}`;
}

/** 책 정보(구매) 화면. */
export function bookHref(bookId: string) {
  return `/book/${bookId}`;
}
