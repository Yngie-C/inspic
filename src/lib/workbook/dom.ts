import type { DOMNode, Element } from "html-react-parser";

/**
 * 파싱된 노드가 HTML 요소인지 판별합니다.
 *
 * `instanceof Element`를 쓰지 마세요. `html-dom-parser`가 ESM 경로에서
 * 자체 `domhandler` 사본을 끌어오기 때문에, 진짜 요소인데도 클래스
 * 정체성이 달라 `instanceof`가 false가 됩니다. 노드의 `type`은 어느
 * 사본에서 왔든 같은 문자열이라 이쪽이 정확합니다.
 */
export function isElementNode(node: DOMNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}
