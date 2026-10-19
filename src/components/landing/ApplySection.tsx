import { BlockStatusText, WorkbookBlock } from "@/components/ui/workbook-block";
import { describeChecklist } from "@/lib/workbook/block-status";

const EXAMPLE_ITEMS = [
  { text: "팀원마다 이번 주 안에 30분씩 1:1을 잡는다", checked: true },
  { text: "첫 질문을 \"요즘 일하면서 제일 막히는 게 뭐예요?\"로 정한다", checked: true },
  { text: "들은 것 중 내가 바로 치워 줄 수 있는 것 하나를 고른다", checked: false },
];

/**
 * 적용 섹션. 책 안에서 독자가 보게 될 모습을 정적으로 보여 줍니다.
 *
 * 리더 템플릿(`ChecklistReader`)은 `WorkbookResponsesProvider` 밖에서 그리면
 * 던지므로 쓰지 않고, 같은 틀(`WorkbookBlock`)로 그린 예시를 둡니다. 예시는
 * 누를 수 없습니다 — 눌러지면 저장되는 줄 압니다.
 */
export function ApplySection() {
  const done = EXAMPLE_ITEMS.filter((item) => item.checked).length;

  return (
    <section className="grid gap-8 border-t border-line pb-14 pt-10 max-[600px]:pb-10 min-[901px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[901px]:gap-12">
      <div className="flex flex-col gap-3">
        <h2 className="text-label text-muted">읽는 책이 아니라 적용하는 책</h2>
        <p className="text-title text-balance text-primary">
          읽다가 그 자리에서 내 일에 맞춰 봐요
        </p>
        <p className="text-body text-muted">
          저자가 현장에서 쓰던 방법은 본문 사이 체크리스트와 질문으로 이어져요.
          내가 쓴 답은 내 계정에만 남아요.
        </p>
      </div>

      <figure aria-label="책 본문과 체크리스트 예시" className="m-0 flex flex-col gap-4">
        <p className="text-body-sm text-primary">
          첫 1:1에서 성과 얘기부터 꺼내면 대화가 금방 닫혀요. 저는 처음 세 번은
          일 얘기를 미루고, 그 사람이 지금 무엇 때문에 막히는지만 물었어요.
        </p>
        <WorkbookBlock
          kind="체크리스트"
          aside={<BlockStatusText status={describeChecklist(EXAMPLE_ITEMS.length, done)} />}
          className="my-0"
        >
          <ul className="pointer-events-none m-0 flex list-none flex-col gap-2 p-0">
            {EXAMPLE_ITEMS.map((item) => (
              <li key={item.text} className="m-0 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="mt-[3px] h-[18px] w-[18px] flex-none accent-accent"
                />
                <span className={item.checked ? "text-muted line-through decoration-1" : undefined}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </WorkbookBlock>
        <figcaption className="text-caption text-muted">책 안에서는 이렇게 보여요</figcaption>
      </figure>
    </section>
  );
}
