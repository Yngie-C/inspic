export type ExportFormat = "pdf" | "epub";

/**
 * 내보내기 파일을 받아 브라우저 다운로드로 넘깁니다.
 *
 * `<a href="/api/pdf?...">`로 두지 않는 이유는 실패했을 때입니다. 그
 * 경우 브라우저가 에러 JSON을 파일로 저장해 버려서, 독자는 열리지 않는
 * 파일을 받고 무엇이 잘못됐는지 알 수 없습니다.
 */
export async function downloadExport(
  bookId: string,
  format: ExportFormat,
  fallbackTitle?: string,
): Promise<void> {
  const res = await fetch(`/api/${format}?bookId=${encodeURIComponent(bookId)}`);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `${format.toUpperCase()} 생성에 실패했습니다.`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filenameFromResponse(res, fallbackTitle, format);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 서버가 정한 이름을 씁니다. 한글 제목은 `filename*`에 실려 옵니다. */
function filenameFromResponse(
  res: Response,
  fallbackTitle: string | undefined,
  format: ExportFormat,
): string {
  const disposition = res.headers.get("Content-Disposition");

  if (disposition) {
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encoded) return decodeURIComponent(encoded[1]);

    const plain = disposition.match(/filename="([^"]+)"/i);
    if (plain) return plain[1];
  }

  return `${fallbackTitle ?? "book"}.${format}`;
}
