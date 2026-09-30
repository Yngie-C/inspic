import { FileText, PenLine, Download } from "lucide-react";

export function FeaturesSection() {
  const features = [
    { icon: FileText, title: "읽기", desc: "어디서든 편하게 읽을 수 있는 챕터 단위 리딩 경험." },
    { icon: PenLine, title: "직접 쓰기", desc: "책 속 체크리스트·성찰 질문·목표 시트에 바로 답하세요. 다른 기기에서도 이어집니다." },
    { icon: Download, title: "내 답 간직하기", desc: "작성한 답을 책 내용과 함께 PDF로 내려받을 수 있어요." },
  ];

  return (
    <section className="border-y border-line bg-paper py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:grid-cols-3">
        {features.map((f, i) => (
          <div key={i} className="group flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-mark text-accent">
              <f.icon className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-primary">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
