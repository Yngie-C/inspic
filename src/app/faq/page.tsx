import type { Metadata } from "next";
import { FaqAccordion } from "./FaqAccordion";
import type { FaqItem } from "./FaqAccordion";

export const metadata: Metadata = {
  title: "자주 묻는 질문",
};

const faqItems: FaqItem[] = [
  {
    question: "결제가 안 돼요. 어떻게 하나요?",
    answer:
      "결제는 토스페이먼츠에서 진행돼요. 카드 정보를 다시 확인해 보시고, 그래도 안 되면 contact@inspic.kr로 알려 주세요.",
  },
  {
    question: "환불은 어떻게 하나요?",
    answer:
      "구매 후 7일 안에, 책을 한 번도 열지 않았다면 전액 환불해 드려요. 디지털 콘텐츠라 책을 연 뒤에는 환불이 제한돼요. 환불은 contact@inspic.kr로 요청해 주세요. 자세한 기준은 이용약관 제3조에 있어요.",
  },
  {
    question: "모바일에서도 볼 수 있나요?",
    answer:
      "네. 앱을 설치하지 않아도 모바일 브라우저에서 바로 읽고 답을 쓸 수 있어요.",
  },
  {
    question: "책에 쓴 답은 어디에 저장되나요?",
    answer:
      "로그인한 상태에서 구매한 책(무료 책 포함)에 쓴 답은 계정에 저장돼요. 다른 기기에서 같은 책을 열어도 이어서 쓸 수 있어요. 로그인하지 않았거나 미리보기로 읽는 중이면 답이 이 기기에만 남고, 읽기 화면에 그렇게 표시돼요. 쓴 답은 '내 워크북'에서 모아 볼 수 있어요.",
  },
  {
    question: "쓴 답을 내려받을 수 있나요?",
    answer:
      "'내 워크북'에서 책 본문과 내 답을 함께 담은 PDF를 받을 수 있어요.",
  },
  {
    question: "내 책을 내고 싶어요. 어떻게 하나요?",
    answer:
      "가입한 뒤 상단 메뉴의 '스튜디오'에서 '새 책'을 누르세요. 직접 쓰거나 파일(TXT, MD, DOCX)을 올릴 수 있어요. 편집 화면에서 슬래시(/)를 입력하면 체크리스트·성찰 질문 같은 블록을 넣을 수 있어요.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <h1 className="mb-2 text-4xl font-bold text-primary">자주 묻는 질문</h1>
      <p className="mb-8 text-muted">
        찾는 답이 없으면 contact@inspic.kr로 물어봐 주세요.
      </p>
      <FaqAccordion items={faqItems} />
    </div>
  );
}
