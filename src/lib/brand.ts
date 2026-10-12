/**
 * 서비스 이름과 문의 주소. 화면·메타데이터·PDF가 이 값을 함께 씁니다.
 *
 * 한국어 문장 속 이름(소개·약관·개인정보처리방침)은 여기서 끼워 넣지 않습니다.
 * 받침에 따라 조사(은/는, 이/가)가 달라지므로 이름을 바꿀 때 문장째 고치세요.
 * 사용자에게 보이지 않는 식별자(응답 캐시 키 `inspic_workbook`, webhook 헤더
 * `x-inspic-webhook-secret`)도 여기 묶지 않습니다 — 캐시 키를 바꾸면 기기에 남은
 * 미전송 답을 잃습니다.
 */
export const SERVICE_NAME = "SecretTome";
export const CONTACT_EMAIL = "info@sunbagel.com";
