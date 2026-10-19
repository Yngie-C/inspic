import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "소개",
  description:
    "SecretTome은 현장에서 직접 해 본 사람의 노하우를 담은 실전 워크북을 펴내는 곳이에요. 읽다가 내 상황에 맞춰 바로 적용해 볼 수 있어요.",
};

interface Point {
  title: string;
  description: string;
}

const readerPoints: Point[] = [
  {
    title: "해 본 사람의 방법을 읽어요",
    description:
      "저자는 그 일을 현장에서 직접 해 본 사람이에요. 실제로 쓰던 방법과 판단 기준을 담아요.",
  },
  {
    title: "읽다가 바로 써요",
    description:
      "본문 사이 체크리스트·질문·목표에 그 자리에서 답해요. 답은 계정에 저장돼 다른 기기에서 이어서 쓸 수 있어요.",
  },
  {
    title: "쓴 답을 간직해요",
    description: "책 본문과 내 답을 함께 담은 PDF를 받을 수 있어요.",
  },
];

const creatorPoints: Point[] = [
  {
    title: "원고에 질문을 끼워 넣어요",
    description:
      "직접 쓰거나 TXT·MD·DOCX 파일을 올리면 장이 나뉘어요. 본문 어디서든 슬래시(/)를 입력해 체크리스트·척도·성찰·목표·참고 블록을 넣을 수 있어요.",
  },
  {
    title: "독자가 어디까지 했는지 봐요",
    description:
      "판매 현황과 함께, 독자가 어느 질문에 얼마나 답했는지 볼 수 있어요. 답의 내용은 독자 본인만 봐요.",
  },
  {
    title: "가격은 크리에이터가 정해요",
    description: "저작권은 크리에이터에게 있어요. 무료로 공개할 수도 있어요.",
  },
];

const steps: Point[] = [
  {
    title: "원고를 준비해요",
    description:
      "직접 쓰거나 파일을 올린 뒤, 독자가 답할 곳에 질문과 체크리스트를 넣어요.",
  },
  {
    title: "검수하고 공개해요",
    description:
      "미리보기에서 공개 전 검수를 통과하면 가격을 정해 바로 공개할 수 있어요.",
  },
  {
    title: "반응을 확인해요",
    description:
      "독자가 어느 질문에 답했고 어디서 멈췄는지 분석 화면에서 볼 수 있어요.",
  },
];

/**
 * 1px 선으로 나눈 목록. 아이콘 + 제목 + 설명 카드 3개 배열은 쓰지 않습니다
 * (DESIGN.md Don'ts). `numbered`면 번호를 잉크색 숫자로 붙입니다.
 */
function PointList({ items, numbered = false }: { items: Point[]; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <List className="m-0 flex list-none flex-col p-0">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="grid gap-1 border-t border-line py-5 min-[601px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[601px]:gap-6"
        >
          <h3 className="flex gap-3 text-subtitle text-primary">
            {numbered && <span className="tabular-nums">{index + 1}</span>}
            {item.title}
          </h3>
          <p className="text-body text-muted">{item.description}</p>
        </li>
      ))}
    </List>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-[936px] flex-col gap-14 px-4 pb-16 pt-14 min-[601px]:px-6 max-[600px]:gap-10 max-[600px]:pt-10">
      {/* 워크북은 아래 "독자는"에서 말합니다. 여기서는 해 본 사람의 노하우만. */}
      <section className="flex max-w-[34em] flex-col gap-3">
        <h1 className="text-display text-primary max-[600px]:text-[25px]">
          해 본 사람의 노하우를,
          <br />
          내 일에 바로
        </h1>
        <p className="text-body text-muted">
          SecretTome의 책은 현장에서 직접 부딪혀 본 사람이 써요. 그 사람이 실제로
          쓰던 방법을 담았고, 읽으면서 내 일에 바로 가져가 볼 수 있어요.
        </p>
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-title text-primary">독자는</h2>
        <PointList items={readerPoints} />
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-title text-primary">크리에이터는</h2>
        <PointList items={creatorPoints} />
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-title text-primary">크리에이터는 이렇게 시작해요</h2>
        <PointList items={steps} numbered />
      </section>

      <section className="flex flex-col items-start justify-between gap-4 border-t border-line pt-10 min-[601px]:flex-row min-[601px]:items-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-subtitle text-primary">현장에서 쌓은 노하우를 책으로 내 보세요</h2>
          <p className="text-body-sm text-muted">
            원고 파일이 있으면 올려서 바로 시작할 수 있어요.
          </p>
        </div>
        <Button asChild>
          <Link href="/auth/signup">가입하고 시작하기</Link>
        </Button>
      </section>
    </div>
  );
}
