import { FileText, PenLine, Download } from "lucide-react";

export function FeaturesSection() {
  const features = [
    { icon: FileText, title: "짧게 읽기", desc: "장마다 읽는 시간이 적혀 있어요. 필요한 장부터 골라 읽어도 돼요." },
    { icon: PenLine, title: "읽다가 써 보기", desc: "본문 사이 체크리스트·질문·목표에 바로 답하세요. 다른 기기에서 이어서 쓸 수 있어요." },
    { icon: Download, title: "답 간직하기", desc: "쓴 답을 책 본문과 함께 PDF로 받을 수 있어요." },
  ];

  return (
    <section className="border-y border-line bg-paper py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:grid-cols-3">
        {features.map((f, i) => (
          <div key={i} className="group flex flex-col items-center text-center">
            {/* 아이콘을 면 위에 올리지 않는다(DESIGN.md Don'ts). */}
            <f.icon className="mb-4 h-7 w-7 text-primary" strokeWidth={1.75} aria-hidden />
            <h3 className="text-lg font-bold text-primary">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
