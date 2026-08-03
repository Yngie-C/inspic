// MVP 워크북 템플릿 5종. 각 모듈은 import 시 registerTemplate()으로 자기 자신을 등록한다.
import "./ChecklistReader";
import "./CalloutReader";
import "./ReflectionReader";
import "./SmartGoalReader";
import "./ScaleReader";
export { getTemplateComponent, registerTemplate } from "./TemplateRenderer";
