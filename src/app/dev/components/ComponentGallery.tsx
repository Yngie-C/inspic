"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { BookCover } from "@/components/ui/book-cover";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SWATCHES = [
  "primary", "muted", "faint", "accent", "accent-hover", "on-accent", "on-primary",
  "paper", "surface", "mark", "line", "line-strong", "field", "field-line",
  "danger", "success", "warning", "info",
];

const TYPE_SCALE = [
  ["text-display", "display 32 · 장 제목, 책 제목"],
  ["text-title", "title 21 · 본문 h2, 섹션 제목"],
  ["text-subtitle", "subtitle 16 · 블록 질문, 카드 제목"],
  ["text-body-reader", "body-reader 17 · 리더 본문은 이 크기로 읽힌다"],
  ["text-body", "body 15 · 일반 UI와 블록 내부"],
  ["text-body-sm", "body-sm 14 · 목차, 버튼, 표"],
  ["text-caption text-muted", "caption 13 · 메타, 상태"],
  ["text-label text-muted", "label 12 · 체크리스트"],
] as const;

const COVER_IDS = ["a", "b", "c"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="text-label text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function ComponentGallery() {
  const { addToast } = useToast();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-balance">컴포넌트 검증</h1>
        <p className="text-body text-muted">DESIGN.md 토큰과 프리미티브를 한 화면에서 본다.</p>
      </header>

      <Section title="색">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {SWATCHES.map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div
                className="h-12 rounded-sm border border-line"
                style={{ background: `var(--color-${name})` }}
              />
              <span className="text-caption text-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="타이포">
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map(([cls, text]) => (
            <p key={cls} className={cls}>{text}</p>
          ))}
          <p className="font-mono text-code">const answer = await saveResponse(blockId);</p>
        </div>
      </Section>

      <Section title="버튼">
        <div className="flex flex-wrap items-center gap-3">
          <Button>주요 행동</Button>
          <Button variant="secondary">보조</Button>
          <Button variant="outline">외곽선</Button>
          <Button variant="ghost">고스트</Button>
          <Button variant="destructive">삭제</Button>
          <Button variant="link">링크</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">작게</Button>
          <Button size="md">보통</Button>
          <Button size="lg">크게</Button>
          <Button disabled>비활성</Button>
          <Button isLoading>저장 중</Button>
          <Button variant="outline" isLoading>불러오는 중</Button>
        </div>
      </Section>

      <Section title="입력">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="dev-name" label="이름" placeholder="이름을 적어 주세요" />
          <Input id="dev-filled" label="채운 값" defaultValue="Inspic 워크북" />
          <Input
            id="dev-error"
            label="이메일"
            defaultValue="reader@"
            error="이메일 형식이 아니에요. @ 뒤에 도메인을 적어 주세요."
          />
          <Input id="dev-disabled" label="비활성" defaultValue="수정할 수 없음" disabled />
        </div>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" defaultChecked /> 체크박스(accent-color)
        </label>
      </Section>

      <Section title="카드 · 드롭다운 · 토스트 · 스피너">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>카드 제목</CardTitle>
              <CardDescription>그림자 없이 line 1px로 구분한다.</CardDescription>
            </CardHeader>
            <CardContent className="text-body">본문 내용이 들어간다.</CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">확인</Button>
              <Button size="sm" variant="secondary">취소</Button>
            </CardFooter>
          </Card>
          <div className="flex flex-col items-start gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">드롭다운 열기</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>내 책</DropdownMenuLabel>
                <DropdownMenuItem>편집</DropdownMenuItem>
                <DropdownMenuItem>미리보기</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>삭제(비활성)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => addToast({ title: "저장했어요" })}>
                토스트
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  addToast({
                    title: "저장하지 못했어요",
                    description: "네트워크를 확인하고 다시 시도해 주세요.",
                    variant: "error",
                  })
                }
              >
                오류 토스트
              </Button>
            </div>
            <div className="flex items-center gap-3 text-muted">
              <Spinner size="sm" />
              <Spinner />
              <Spinner size="lg" />
              <span className="text-caption">불러오는 중</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="책 표지 플레이스홀더">
        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          {COVER_IDS.map((id, i) => (
            <div key={id} className="relative aspect-[3/4] overflow-hidden rounded-sm border border-primary/10">
              <BookCover
                bookId={id}
                title={["적용하는 독서법", "하루 10분 회고 워크북", "나의 강점 찾기"][i]}
                sizes="200px"
                size={(["sm", "md", "lg"] as const)[i]}
              />
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
