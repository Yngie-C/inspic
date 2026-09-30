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
      "토스페이먼츠를 통해 결제가 진행됩니다. 카드 정보를 확인하시고, 문제가 지속되면 contact@inspic.kr로 문의해주세요.",
  },
  {
    question: "환불은 어떻게 하나요?",
    answer:
      "디지털 콘텐츠 특성상 콘텐츠 열람 후에는 환불이 제한됩니다. 미열람 상태에서 구매 후 7일 이내에 환불을 요청하시면 전액 환불해드립니다. contact@inspic.kr로 문의해주세요.",
  },
  {
    question: "모바일에서도 볼 수 있나요?",
    answer:
      "네, 별도 앱 설치 없이 모바일 브라우저에서 바로 읽고 워크시트를 작성할 수 있습니다.",
  },
  {
    question: "워크시트에 쓴 답은 어디에 저장되나요?",
    answer:
      "로그인한 상태라면 답이 계정에 저장되어, 다른 기기에서 같은 책을 열어도 이어서 쓸 수 있습니다. 로그인하지 않으면 답이 계정에 남지 않으며, 읽기 화면에 그 상태가 표시됩니다. 작성한 답은 '내 워크북'에서 모아 볼 수 있습니다.",
  },
  {
    question: "작성한 답을 내려받을 수 있나요?",
    answer:
      "'내 워크북'에서 책 내용과 내 답을 함께 담은 PDF를 내려받을 수 있습니다.",
  },
  {
    question: "내 콘텐츠를 올리고 싶어요. 어떻게 하나요?",
    answer:
      "회원가입 후 크리에이터 스튜디오에서 '새 콘텐츠'를 눌러 직접 쓰거나 파일(TXT, MD, DOCX)을 업로드할 수 있습니다. 에디터에서 슬래시(/)를 입력하면 체크리스트·성찰 질문 같은 워크시트를 넣을 수 있습니다.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <h1 className="mb-2 font-logo text-4xl font-bold text-gray-900">자주 묻는 질문</h1>
      <p className="mb-8 text-gray-500">
        inspic 이용에 대해 궁금한 점을 확인하세요.
      </p>
      <FaqAccordion items={faqItems} />
    </div>
  );
}
