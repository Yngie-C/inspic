import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-gray-500 mb-10">최종 수정일: 2026년 9월 30일</p>

      <p className="mb-8 text-gray-700 leading-relaxed">
        inspic(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 및
        관련 법령을 준수합니다. 본 방침은 회사가 제공하는 서비스 이용 과정에서 수집되는
        개인정보의 처리 방법을 안내합니다.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">1. 수집하는 개인정보 항목</h2>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <div>
            <p className="font-medium mb-1">필수 수집 항목</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>이메일 주소</li>
              <li>닉네임(표시 이름)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">선택 수집 항목</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>프로필 이미지</li>
              <li>자기소개</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">자동 수집 항목</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>서비스 이용 기록</li>
              <li>접속 로그(IP 주소, 브라우저 종류, 접속 일시)</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">2. 개인정보 수집 및 이용 목적</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 leading-relaxed pl-2">
          <li>회원 가입, 본인 확인 등 회원 관리</li>
          <li>콘텐츠 제공, 워크북 응답 저장 등 서비스 제공</li>
          <li>유료 콘텐츠 구매 및 결제 처리</li>
          <li>서비스 관련 공지사항 전달 및 고객 지원</li>
          <li>서비스 개선을 위한 통계 분석 및 이용 현황 파악</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">3. 개인정보 보관 및 이용 기간</h2>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            회원 탈퇴 시 수집된 개인정보는 즉시 파기합니다. 단, 관계 법령에 따라 보관 의무가
            있는 경우에는 해당 기간 동안 보관합니다.
          </p>
          <div>
            <p className="font-medium mb-2">전자상거래 등에서의 소비자 보호에 관한 법률에 따른 보관</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>계약 또는 청약철회에 관한 기록: 5년</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
              <li>소비자 불만 또는 분쟁처리에 관한 기록: 3년</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">통신비밀보호법에 따른 보관</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>서비스 이용 로그: 3개월</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">4. 개인정보 제3자 제공</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만, 원활한
          서비스 제공을 위해 아래와 같이 업무를 위탁하고 있습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-700 border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-medium">수탁업체</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-medium">위탁 업무 내용</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-medium">보유 및 이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Supabase, Inc.</td>
                <td className="border border-gray-200 px-4 py-2">데이터베이스 및 인증 서비스 제공</td>
                <td className="border border-gray-200 px-4 py-2">회원 탈퇴 시까지</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">토스페이먼츠(주)</td>
                <td className="border border-gray-200 px-4 py-2">결제 처리 및 정산</td>
                <td className="border border-gray-200 px-4 py-2">법령에 따른 보관 기간</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">5. 개인정보 파기 절차 및 방법</h2>
        <div className="space-y-3 text-gray-700 leading-relaxed">
          <p>이용자의 개인정보는 보유 기간이 경과하거나 처리 목적이 달성된 경우 즉시 파기합니다.</p>
          <div>
            <p className="font-medium mb-1">전자적 파일 형태</p>
            <p className="pl-2">복구 및 재생이 불가능한 기술적 방법으로 영구 삭제합니다.</p>
          </div>
          <div>
            <p className="font-medium mb-1">서면, 출력물 등 물리적 형태</p>
            <p className="pl-2">분쇄기로 분쇄하거나 소각합니다.</p>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">6. 이용자의 권리</h2>
        <div className="space-y-3 text-gray-700 leading-relaxed">
          <p>이용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>개인정보 열람 요구</li>
            <li>개인정보 오류에 대한 정정 요구</li>
            <li>개인정보 삭제 요구</li>
            <li>개인정보 처리 정지 요구</li>
          </ul>
          <p>
            위 권리 행사는 서비스 내 계정 설정 페이지 또는 아래 개인정보 보호책임자에게 이메일로
            요청할 수 있습니다. 요청을 받은 날로부터 10일 이내에 처리 결과를 안내해 드립니다.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">7. 개인정보 보호책임자</h2>
        <div className="text-gray-700 leading-relaxed space-y-1">
          <p>개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등은 아래 담당자에게 연락하시기 바랍니다.</p>
          <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-1">
            <p><span className="font-medium">성명:</span> [이름]</p>
            <p><span className="font-medium">이메일:</span> [이메일]</p>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            개인정보 침해에 관한 신고나 상담은 개인정보보호위원회(privacy.go.kr, 국번 없이 182) 또는
            한국인터넷진흥원 개인정보침해신고센터(privacy.kisa.or.kr, 118)에 문의하실 수 있습니다.
          </p>
        </div>
      </section>
    </main>
  );
}
