// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, readImageUpload, sniffImageType } from "./image-upload";

/** 파일 종류는 앞머리로 정합니다(코드 리뷰 5-P2-9·5-P2-10). */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

function imageRequest(bytes: Uint8Array, type: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type }), "a");
  return new Request("http://localhost/upload", { method: "POST", body: form, headers });
}

const ALL = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

describe("sniffImageType", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["GIF", GIF, "image/gif"],
    ["WebP", WEBP, "image/webp"],
  ])("%s를 알아본다", (_name, bytes, mime) => {
    expect(sniffImageType(bytes)).toBe(mime);
  });

  it("이미지가 아니거나 너무 짧으면 null", () => {
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("readImageUpload", () => {
  it("image/png라고 적은 HTML은 415 — 적힌 type을 믿지 않는다", async () => {
    const result = await readImageUpload(imageRequest(HTML, "image/png"), ALL, "JPEG, PNG");
    expect(result).toMatchObject({ ok: false, status: 415 });
    if (!result.ok) expect(result.message).toBe("JPEG, PNG 이미지만 올릴 수 있어요.");
  });

  it("적힌 type과 달라도 앞머리로 판정한 종류와 확장자를 쓴다", async () => {
    const result = await readImageUpload(imageRequest(PNG, "image/jpeg"), ALL, "");
    expect(result).toMatchObject({ ok: true, mime: "image/png", extension: "png" });
  });

  it("허용하지 않은 종류는 415", async () => {
    const result = await readImageUpload(
      imageRequest(GIF, "image/gif"),
      ["image/jpeg", "image/png", "image/webp"],
      "JPEG, PNG, WebP",
    );
    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it("Content-Length가 상한을 넘으면 본문을 읽지 않고 413", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": String(MAX_IMAGE_BYTES * 2) },
      body: "x",
    });
    let read = false;
    Object.defineProperty(request, "formData", {
      value: () => {
        read = true;
        throw new Error("읽으면 안 됨");
      },
    });
    const result = await readImageUpload(request, ALL, "");
    expect(result).toMatchObject({ ok: false, status: 413 });
    expect(read).toBe(false);
  });

  it("길이를 밝히지 않아도 파일이 5MB를 넘으면 413", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    const result = await readImageUpload(imageRequest(big, "image/png"), ALL, "");
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("image 필드가 없거나 본문이 multipart가 아니면 400", async () => {
    const form = new FormData();
    form.append("image", "글자");
    const noFile = new Request("http://localhost/upload", { method: "POST", body: form });
    expect(await readImageUpload(noFile, ALL, "")).toMatchObject({ ok: false, status: 400 });

    const notMultipart = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(await readImageUpload(notMultipart, ALL, "")).toMatchObject({ ok: false, status: 400 });
  });
});
