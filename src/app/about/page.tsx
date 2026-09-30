import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  ListChecks,
  PenLine,
  Download,
  BarChart3,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "소개",
  description:
    "inspic은 읽는 책이 아니라 적용하는 책, 인터랙티브 워크북을 출판하는 플랫폼입니다.",
};

const features = [
  {
    icon: FileText,
    title: "원고만 있으면 시작할 수 있습니다",
    description:
      "에디터에서 직접 쓰거나 파일(TXT, MD, DOCX)을 업로드하세요. 챕터가 자동으로 나뉩니다.",
  },
  {
    icon: ListChecks,
    title: "워크시트를 끼워 넣으세요",
    description:
      "체크리스트, 성찰 질문, SMART 목표, 1–10 스케일, 콜아웃. 본문 사이 어디든 슬래시(/) 명령으로 넣을 수 있습니다.",
  },
  {
    icon: PenLine,
    title: "독자는 읽으면서 씁니다",
    description:
      "독자의 답은 계정에 저장되어, 다른 기기에서도 이어서 쓸 수 있습니다.",
  },
  {
    icon: Download,
    title: "쓴 답은 독자의 것",
    description:
      "독자는 책 내용과 자신의 답을 함께 담은 PDF를 내려받을 수 있습니다.",
  },
  {
    icon: BarChart3,
    title: "참여를 확인하세요",
    description:
      "판매 현황과 함께, 독자가 어떤 워크시트에 얼마나 답했는지 볼 수 있습니다.",
  },
  {
    icon: Users,
    title: "크리에이터 중심 구조",
    description:
      "콘텐츠의 저작권은 크리에이터에게 귀속됩니다. 가격은 크리에이터가 정하고, 무료로 공개할 수도 있습니다.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20">
      {/* Hero */}
      <section className="mb-20 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          읽는 책이 아니라 적용하는 책
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-600">
          inspic은 원고에 워크시트·체크리스트·성찰 질문을 끼워 넣어 워크북으로
          출간하는 플랫폼입니다. 독자는 읽으면서 직접 쓰고, 그 답은 독자의 계정에
          남습니다.
        </p>
      </section>

      {/* Features Grid */}
      <section className="mb-20">
        <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">
          inspic이 제공하는 것
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-gray-100 bg-white p-6 hover:-translate-y-2 hover:shadow-lg transition-all duration-300"
            >
              <feature.icon className="mb-3 h-8 w-8 text-accent" />
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mb-20">
        <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">
          어떻게 시작하나요?
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "글을 작성하세요",
              description:
                "에디터에서 직접 쓰거나 파일을 업로드하고, 필요한 곳에 워크시트를 넣으세요.",
            },
            {
              step: "2",
              title: "발행하세요",
              description:
                "미리보기에서 공개 전 검수를 통과하면, 가격을 정해 바로 공개할 수 있습니다.",
            },
            {
              step: "3",
              title: "독자를 만나세요",
              description:
                "독자가 읽으며 워크시트를 채우고, 크리에이터는 참여 반응을 확인합니다.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent">
                {item.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-500">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-white px-6 py-14 text-center">
        <div className="relative">
          <h2 className="mb-3 text-2xl font-bold text-gray-900 sm:text-3xl">
            나만의 콘텐츠를 출판해보세요
          </h2>
          <p className="mb-8 text-gray-500">
            누구나 무료로 시작할 수 있습니다. 글만 있으면 충분해요.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block rounded-full bg-accent px-8 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>
    </div>
  );
}
