import type { Chapter } from "@/types";
import { DEV_CHAPTERS } from "../_mock/book";

/**
 * 쪽 넘김 리더 검증용 장 목록. 목 데이터는 장이 짧아 한
 * 쪽에 다 들어가므로, 앞뒤에 본문을 붙여 여러 쪽에 걸치게 한다. 블록이
 * 쪽 경계 근처에 오는 경우를 보려고 3장 끝에 성찰 블록을 하나 더 둔다.
 */

const FILLER = [
  "처음 몇 번은 결과가 마음에 들지 않을 거예요. 괜찮아요. 이 장의 목적은 완벽한 글이 아니라, 고칠 수 있는 첫 버전을 손에 쥐는 거예요.",
  "해 본 사람들이 공통으로 하는 말이 있어요. 도구를 익히는 데 쓰는 시간보다, 내 상황에 맞게 한 번 돌려 보는 시간이 훨씬 많이 남는다는 거예요.",
  "여기서 소개하는 순서는 현장에서 여러 번 고쳐 쓴 끝에 남은 순서예요. 건너뛰고 싶은 단계가 있어도 처음 한 번은 그대로 따라가 보세요.",
  "막히는 지점은 대부분 비슷해요. 명령어를 잘못 친 경우보다, 무엇을 원하는지 한 문장으로 말하지 못한 경우가 더 많아요.",
  "결과물을 저장할 폴더 이름은 나중에 바꾸기 어려우니 지금 정해 두세요. 날짜보다는 목적이 드러나는 이름이 오래 갑니다.",
  "한 번에 하나씩만 바꾸세요. 두 가지를 동시에 고치면 어느 쪽이 효과가 있었는지 알 수 없어요.",
];

function filler(count: number, offset = 0) {
  return Array.from(
    { length: count },
    (_, i) => `<p>${FILLER[(i + offset) % FILLER.length]}</p>`,
  ).join("\n");
}

const EXTRA_REFLECTION = `<section data-template-type="reflection" data-node-id="d0000000-0000-4000-8000-000000000008" data-prompt="이번 장에서 내 일에 바로 가져갈 한 가지를 적어 보세요." data-placeholder="예: 공고를 받으면 먼저 요구 역량 세 개를 뽑는다"></section>`;

export const DEV_PAGED_CHAPTERS: Chapter[] = DEV_CHAPTERS.map((chapter, i) => {
  if (i === 1) {
    return {
      ...chapter,
      content_html: `${filler(3)}\n${chapter.content_html}\n${filler(4, 2)}`,
    };
  }
  if (i === 2) {
    return {
      ...chapter,
      content_html: `<h2>${chapter.title}</h2>\n${filler(9, 1)}\n${EXTRA_REFLECTION}\n${filler(2, 4)}`,
    };
  }
  return { ...chapter, content_html: `${filler(7, i)}` };
});
