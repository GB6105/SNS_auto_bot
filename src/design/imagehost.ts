// 이미지 호스팅: 렌더한 PNG를 공개 HTTPS URL로 업로드. IG Graph API는 image_url(공개 URL)만 받음.
import type { RenderedImage } from "./renderer.js";

export interface ImageHost {
  readonly name: string;
  /** 로컬 이미지 파일 → 공개 접근 가능한 URL */
  upload(image: RenderedImage): Promise<string>;
}

/**
 * stub 호스트: 외부 스토리지 없이 흐름 검증. file:// 경로를 반환(공개 URL 아님 → IG 실게시 불가).
 * dry-run 게시와 짝을 이룬다.
 */
export class StubImageHost implements ImageHost {
  readonly name = "stub";
  async upload(image: RenderedImage): Promise<string> {
    return `file://${image.path}`;
  }
}

/**
 * 범용 PUT 업로드 호스트: 미리 만든 공개 버킷(S3/R2/스토리지)에 PUT.
 * env:
 *   IMAGE_UPLOAD_BASE   업로드 PUT 대상 베이스 URL (예: https://bucket.r2.example.com)
 *   IMAGE_PUBLIC_BASE   공개 접근 베이스 URL (없으면 업로드 베이스 재사용)
 *   IMAGE_UPLOAD_TOKEN  (선택) Bearer 토큰
 * RALPH-BLOCKER: 공개 버킷/스토리지 + 쓰기 자격증명 필요(외부 설정). 없으면 StubImageHost 사용.
 */
export class HttpPutImageHost implements ImageHost {
  readonly name = "http-put";
  constructor(
    private readonly uploadBase: string,
    private readonly publicBase: string,
    private readonly readFileBytes: (path: string) => Promise<Uint8Array>,
    private readonly token?: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async upload(image: RenderedImage): Promise<string> {
    const key = image.path.split("/").pop()!;
    const headers: Record<string, string> = { "content-type": image.mime };
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    const body = await this.readFileBytes(image.path);
    const res = await this.fetchFn(`${this.uploadBase}/${key}`, { method: "PUT", headers, body: body as unknown as BodyInit });
    if (!res.ok) throw new Error(`이미지 업로드 실패 ${res.status}: ${await res.text()}`);
    return `${this.publicBase}/${key}`;
  }
}

export function makeImageHost(readFileBytes: (path: string) => Promise<Uint8Array>): ImageHost {
  const { IMAGE_UPLOAD_BASE, IMAGE_PUBLIC_BASE, IMAGE_UPLOAD_TOKEN } = process.env;
  if (IMAGE_UPLOAD_BASE) {
    return new HttpPutImageHost(IMAGE_UPLOAD_BASE, IMAGE_PUBLIC_BASE ?? IMAGE_UPLOAD_BASE, readFileBytes, IMAGE_UPLOAD_TOKEN);
  }
  return new StubImageHost();
}
