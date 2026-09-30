import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">이용약관</h1>
      <p className="mb-10 text-sm text-gray-500">
        시행일: 2026년 9월 30일 &nbsp;|&nbsp; 최종 수정일: 2026년 9월 30일
      </p>

      <p className="mb-10 text-sm leading-relaxed text-gray-600">
        본 이용약관은 inspic(이하 &quot;회사&quot;)이 운영하는 디지털 콘텐츠
        플랫폼 <strong>inspic</strong>(이하 &quot;서비스&quot;)의 이용 조건을
        규정합니다. 서비스를 이용하시기 전에 본 약관을 주의 깊게 읽어 주시기
        바랍니다. 본 약관은 법률 전문가의 검토를 거친 최종본이 아닌 템플릿이며,
        실제 서비스 운영 전 법률 전문가의 검토를 권장합니다.
      </p>

      {/* 1. 서비스 이용 조건 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          제1조 서비스 이용 조건
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            1. 본 서비스는 만 14세 이상의 이용자가 이용할 수 있습니다. 만 14세
            미만의 이용자는 법정 대리인의 동의가 있어야 합니다.
          </p>
          <p>
            2. 이용자는 회원가입 시 정확하고 최신의 정보를 제공해야 하며, 정보
            변경 시 즉시 업데이트해야 합니다.
          </p>
          <p>
            3. 이용자는 자신의 계정 및 비밀번호를 안전하게 관리할 책임이
            있습니다. 계정 도용 또는 무단 사용이 발생한 경우 즉시 회사에
            통보하여야 합니다.
          </p>
          <p>
            4. 이용자는 서비스를 이용하면서 다음의 행위를 해서는 안 됩니다.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-gray-600">
            <li>타인의 개인정보 또는 저작물을 무단으로 사용하는 행위</li>
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>불법적이거나 유해한 콘텐츠를 업로드하거나 배포하는 행위</li>
            <li>상업적 스팸 또는 광고 목적의 무단 메시지 전송 행위</li>
            <li>회사의 사전 동의 없이 서비스를 상업적 목적으로 이용하는 행위</li>
          </ul>
          <p>
            5. 회사는 이용자가 본 조항을 위반하는 경우 사전 통보 없이 해당
            이용자의 서비스 이용을 제한하거나 계정을 정지 또는 삭제할 수
            있습니다.
          </p>
        </div>
      </section>

      {/* 2. 콘텐츠 저작권 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          제2조 콘텐츠 저작권
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            1. 크리에이터가 inspic 플랫폼에 업로드한 모든 콘텐츠(전자책, 워크북,
            이미지, 텍스트 등)의 저작권은 해당 콘텐츠를 창작한 크리에이터에게
            귀속됩니다.
          </p>
          <p>
            2. 크리에이터는 콘텐츠를 업로드함으로써, 회사에 대해 서비스 운영
            및 제공 목적에 한하여 콘텐츠를 사용, 복제, 배포, 전송할 수 있는
            비독점적 라이선스를 부여합니다. 이 라이선스는 서비스 제공 이외의
            목적으로는 사용되지 않습니다.
          </p>
          <p>
            3. 회사는 크리에이터의 콘텐츠를 마케팅 또는 홍보 목적으로 사용하고자
            하는 경우, 사전에 크리에이터의 동의를 구합니다.
          </p>
          <p>
            4. 이용자는 서비스 내 콘텐츠를 개인적인 열람 목적 외에 무단으로
            복제, 배포, 전송, 수정하거나 2차적 저작물을 작성해서는 안 됩니다.
          </p>
          <p>
            5. 타인의 저작물을 무단으로 사용하여 발생하는 법적 책임은 해당
            콘텐츠를 업로드한 크리에이터에게 있으며, 회사는 이에 대한 책임을
            지지 않습니다.
          </p>
        </div>
      </section>

      {/* 3. 디지털 콘텐츠 환불 정책 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          제3조 디지털 콘텐츠 환불 정책
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            1. 「전자상거래 등에서의 소비자보호에 관한 법률」(이하
            &quot;전자상거래법&quot;) 제17조에 따라, 디지털 콘텐츠의 경우 청약
            철회에 일부 제한이 적용됩니다.
          </p>
          <p>
            2. <strong>환불 불가 조건:</strong> 이용자가 구매한 전자책
            콘텐츠를 1페이지 이상 열람한 경우, 콘텐츠의
            특성상 복제가 가능하여 환불이 제한됩니다. 단, 결제 시 이 사실이
            사전에 고지되어야 합니다.
          </p>
          <p>
            3. <strong>환불 가능 조건:</strong> 구매 후 콘텐츠를 전혀 열람하지
            않은 경우, 구매일로부터 7일 이내에 환불을 신청할 수 있습니다.
          </p>
          <p>
            4. <strong>예외적 환불:</strong> 다음의 경우에는 열람 여부와 관계없이
            환불이 가능합니다.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-gray-600">
            <li>콘텐츠가 설명과 현저히 다른 경우</li>
            <li>기술적 결함으로 콘텐츠를 정상적으로 이용할 수 없는 경우</li>
            <li>중복 결제가 발생한 경우</li>
          </ul>
          <p>
            5. 환불 신청은 고객센터를 통해 접수할 수 있으며, 처리 기간은 영업일
            기준 3~5일이 소요될 수 있습니다. 환불 금액은 결제 수단에 따라 카드사
            정책에 의해 실제 환급까지 추가 시간이 걸릴 수 있습니다.
          </p>
        </div>
      </section>

      {/* 4. 면책 조항 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          제4조 면책 조항
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            1. 회사는 크리에이터가 서비스에 등록·제공하는 콘텐츠의 정확성,
            완전성, 신뢰성, 적법성에 대해 보증하지 않습니다. 콘텐츠의 내용에
            관한 책임은 전적으로 해당 콘텐츠를 등록한 크리에이터에게 있습니다.
          </p>
          <p>
            2. 회사는 천재지변, 시스템 장애, 통신 장애 등 불가항력적 사유로
            인한 서비스 중단에 대해 책임을 지지 않습니다.
          </p>
          <p>
            3. 회사는 이용자 상호 간 또는 이용자와 제3자 간에 서비스를 매개로
            발생한 분쟁에 대해 개입할 의무가 없으며, 이로 인한 손해를 배상할
            책임이 없습니다.
          </p>
          <p>
            4. 회사는 서비스를 통해 연결된 외부 링크 또는 제3자 플랫폼의 콘텐츠
            및 서비스에 대해 책임을 지지 않습니다.
          </p>
          <p>
            5. 회사는 이용자가 서비스 이용을 통해 기대하는 수익 또는 이익이
            발생하지 않은 것에 대해 책임을 지지 않습니다.
          </p>
        </div>
      </section>

      {/* 5. 이용약관 변경 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          제5조 이용약관 변경
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            1. 회사는 관련 법령의 변경, 서비스 정책 변경, 기타 합리적인 사유가
            있는 경우 본 약관을 변경할 수 있습니다.
          </p>
          <p>
            2. 약관 변경 시 회사는 변경 내용과 시행일을 명시하여 시행일로부터
            최소 <strong>7일 전</strong>에 서비스 내 공지사항 또는 이메일을 통해
            이용자에게 사전 고지합니다. 다만, 이용자에게 불리한 변경의 경우에는
            최소 <strong>30일 전</strong>에 고지합니다.
          </p>
          <p>
            3. 이용자가 변경된 약관의 시행일 이후에도 서비스를 계속 이용하는
            경우, 변경된 약관에 동의한 것으로 간주합니다.
          </p>
          <p>
            4. 변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고
            회원 탈퇴를 신청할 수 있습니다.
          </p>
        </div>
      </section>

      <div className="border-t border-gray-200 pt-8">
        <p className="text-xs leading-relaxed text-gray-400">
          본 이용약관은 대한민국 법률에 따라 규율됩니다. 서비스 이용과 관련한
          분쟁이 발생하는 경우 회사의 소재지를 관할하는 법원을 전속 관할 법원으로
          합니다. 문의사항은 고객센터를 통해 접수해 주세요.
        </p>
      </div>
    </div>
  );
}
