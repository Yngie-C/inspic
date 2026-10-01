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
    "inspic은 바로 써먹는 지식을 짧게 읽는 워크북을 펴내는 곳이에요. 독자는 읽다가 체크리스트와 질문에 답하고, 그 답은 계정에 남아요.",
};

const readerFeatures = [
  {
    icon: FileText,
    title: "짧게 읽어요",
    description:
      "장마다 읽는 시간이 적혀 있어요. 필요한 장부터 골라 읽어도 돼요.",
  },
  {
    icon: PenLine,
    title: "읽다가 바로 써요",
    description:
      "본문 사이 체크리스트·질문·목표에 그 자리에서 답해요. 답은 계정에 저장돼 다른 기기에서 이어서 쓸 수 있어요.",
  },
  {
    icon: Download,
    title: "쓴 답을 간직해요",
    description:
      "책 본문과 내 답을 함께 담은 PDF를 받을 수 있어요.",
  },
];

const creatorFeatures = [
  {
    icon: ListChecks,
    title: "원고에 질문을 끼워 넣어요",
    description:
      "직접 쓰거나 TXT·MD·DOCX 파일을 올리면 장이 나뉘어요. 본문 어디서든 슬래시(/)를 입력해 체크리스트·척도·성찰·목표·참고 블록을 넣을 수 있어요.",
  },
  {
    icon: BarChart3,
    title: "독자가 어디까지 했는지 봐요",
    description:
      "판매 현황과 함께, 독자가 어느 질문에 얼마나 답했는지 볼 수 있어요. 답의 내용은 독자 본인만 봐요.",
  },
  {
    icon: Users,
    title: "가격은 크리에이터가 정해요",
    description:
      "저작권은 크리에이터에게 있어요. 무료로 공개할 수도 있어요.",
  },
];

function FeatureGrid({ items }: { items: typeof readerFeatures }) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature) => (
        <div
          key={feature.title}
          className="rounded-lg border border-line bg-surface p-6 transition-all duration-300"
        >
          <feature.icon className="mb-3 h-8 w-8 text-primary" />
          <h3 className="mb-2 text-lg font-semibold text-primary">
            {feature.title}
          </h3>
          <p className="text-sm leading-relaxed text-muted">
            {feature.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20">
      {/* Hero */}
      <section className="mb-20 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-primary sm:text-5xl">
          바로 써먹는 지식을, 짧게
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted">
          inspic의 책은 짧은 장과 질문으로 이뤄진 워크북이에요. 독자는 읽다가
          체크리스트와 질문에 답하고, 그 답은 독자의 계정에 남아요.
        </p>
      </section>

      {/* Features */}
      <section className="mb-20">
        <h2 className="mb-6 text-2xl font-bold text-primary">독자는</h2>
        <FeatureGrid items={readerFeatures} />
      </section>
      <section className="mb-20">
        <h2 className="mb-6 text-2xl font-bold text-primary">크리에이터는</h2>
        <FeatureGrid items={creatorFeatures} />
      </section>

      {/* How it works */}
      <section className="mb-20">
        <h2 className="mb-10 text-center text-2xl font-bold text-primary">
          크리에이터는 이렇게 시작해요
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "원고를 준비해요",
              description:
                "직접 쓰거나 파일을 올린 뒤, 독자가 답할 곳에 질문과 체크리스트를 넣어요.",
            },
            {
              step: "2",
              title: "검수하고 공개해요",
              description:
                "미리보기에서 공개 전 검수를 통과하면 가격을 정해 바로 공개할 수 있어요.",
            },
            {
              step: "3",
              title: "반응을 확인해요",
              description:
                "독자가 어느 질문에 답했고 어디서 멈췄는지 분석 화면에서 볼 수 있어요.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-on-accent">
                {item.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-primary">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden rounded-lg border border-line bg-paper px-6 py-14 text-center">
        <div className="relative">
          <h2 className="mb-3 text-2xl font-bold text-primary sm:text-3xl">
            내 노하우를 워크북으로 내 보세요
          </h2>
          <p className="mb-8 text-muted">
            원고 파일이 있으면 올려서 바로 시작할 수 있어요.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block rounded-md bg-accent px-8 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            가입하고 시작하기
          </Link>
        </div>
      </section>
    </div>
  );
}
