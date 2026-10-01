import { cn } from "@/lib/utils";

/**
 * 폼 위에 띄우는 안내. 필드 하나에 묶이지 않는 결과(로그인 실패,
 * 네트워크 오류, 메일 발송 완료)를 씁니다. 필드에 묶인 오류는
 * `Input`의 `error`로 필드 아래에 둡니다 (DESIGN.md 입력).
 */
export function FormAlert({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm",
        tone === "danger"
          ? "border-danger/40 text-danger"
          : "border-success/40 text-success",
        className,
      )}
    >
      {children}
    </div>
  );
}
