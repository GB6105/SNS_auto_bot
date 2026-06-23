// US-10 게시 어댑터 + US-11 성과 수집. IG 캐러셀 + Threads 실구현(토큰 주입 시 동작).
import type { CardCopy, ThreadCopy } from "../domain/types.js";

export interface PublishResult {
  platform: "instagram" | "threads";
  posted: boolean;
  postId: string;
  dryRun: boolean;
  note?: string;
}

/** 게시 인터페이스 — 승인된 콘텐츠만 전달(approval.canPublish 게이트). */
export interface Publisher {
  readonly name: string;
  /** imageUrls: 공개 HTTPS URL 배열(IG는 image_url 필수). 1장=단일, 2장+=캐러셀 */
  publishCard(copy: CardCopy, imageUrls: string[]): Promise<PublishResult>;
  publishThread(copy: ThreadCopy): Promise<PublishResult>;
}

/** dry-run stub — 외부 자격증명 없이 흐름 검증. 실제 게시 안 함. */
export class DryRunPublisher implements Publisher {
  readonly name = "dry-run";
  private seq = 0;
  async publishCard(_copy: CardCopy, imageUrls: string[]): Promise<PublishResult> {
    return { platform: "instagram", posted: false, postId: `dry-ig-${++this.seq}`, dryRun: true, note: `DRY-RUN: ${imageUrls.length}장` };
  }
  async publishThread(_copy: ThreadCopy): Promise<PublishResult> {
    return { platform: "threads", posted: false, postId: `dry-th-${++this.seq}`, dryRun: true, note: "DRY-RUN" };
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";
const THREADS = "https://graph.threads.net/v1.0";

async function post(base: string, path: string, params: Record<string, string>, fetchFn: typeof fetch): Promise<any> {
  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchFn(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`${base}/${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * 실제 게시 어댑터. 자격증명만 주입되면 동작(앱 심사 없이 본인 계정 게시 — 본인 IG를 자기 앱에 역할 추가 가정).
 * RALPH-BLOCKER: IG 비즈/크리에이터 계정 + FB 페이지 연결 + Meta 앱 + 장기 토큰 + 공개 image_url 필요.
 *                Threads는 별도 앱/토큰. IG 24h당 25건 게시 한도 — 호출부 가드 권장.
 */
export class GraphApiPublisher implements Publisher {
  readonly name = "graph-api";
  constructor(
    private readonly igUserId: string,
    private readonly igToken: string,
    private readonly threadsUserId: string,
    private readonly threadsToken: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async publishCard(copy: CardCopy, imageUrls: string[]): Promise<PublishResult> {
    if (imageUrls.length === 0) throw new Error("IG 게시에는 공개 image_url이 최소 1개 필요");
    const caption = copy.caption;
    let creationId: string;

    if (imageUrls.length === 1) {
      // 단일 이미지: 컨테이너 생성 → 게시
      const c = await post(GRAPH, this.igUserId + "/media", { image_url: imageUrls[0], caption, access_token: this.igToken }, this.fetchFn);
      creationId = c.id;
    } else {
      // 캐러셀: 자식 컨테이너들 → 부모 캐러셀 컨테이너 → 게시
      const childIds: string[] = [];
      for (const url of imageUrls) {
        const child = await post(GRAPH, this.igUserId + "/media", { image_url: url, is_carousel_item: "true", access_token: this.igToken }, this.fetchFn);
        childIds.push(child.id);
      }
      const parent = await post(GRAPH, this.igUserId + "/media", { media_type: "CAROUSEL", children: childIds.join(","), caption, access_token: this.igToken }, this.fetchFn);
      creationId = parent.id;
    }

    const pub = await post(GRAPH, this.igUserId + "/media_publish", { creation_id: creationId, access_token: this.igToken }, this.fetchFn);
    return { platform: "instagram", posted: true, postId: pub.id, dryRun: false };
  }

  async publishThread(copy: ThreadCopy): Promise<PublishResult> {
    // Threads: 텍스트 컨테이너 생성 → 게시
    const c = await post(THREADS, this.threadsUserId + "/threads", { media_type: "TEXT", text: copy.text, access_token: this.threadsToken }, this.fetchFn);
    const pub = await post(THREADS, this.threadsUserId + "/threads_publish", { creation_id: c.id, access_token: this.threadsToken }, this.fetchFn);
    return { platform: "threads", posted: true, postId: pub.id, dryRun: false };
  }
}

/** US-11: 성과 수집 인터페이스 */
export interface Insights {
  reach: number;
  saves: number;
  comments: number;
}
export interface InsightsSource {
  readonly name: string;
  fetch(postId: string): Promise<Insights>;
}

/** IG 인사이트 — reach/saved/comments 메트릭 조회 */
export class GraphInsights implements InsightsSource {
  readonly name = "graph-insights";
  // RALPH-BLOCKER: IG insights 권한 + 토큰 필요.
  constructor(private readonly token: string, private readonly fetchFn: typeof fetch = fetch) {}
  async fetch(postId: string): Promise<Insights> {
    const url = new URL(`${GRAPH}/${postId}/insights`);
    url.searchParams.set("metric", "reach,saved,comments");
    url.searchParams.set("access_token", this.token);
    const res = await this.fetchFn(url.toString());
    if (!res.ok) throw new Error(`insights ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
    const pick = (n: string) => data.data?.find((d) => d.name === n)?.values?.[0]?.value ?? 0;
    return { reach: pick("reach"), saves: pick("saved"), comments: pick("comments") };
  }
}

/** stub — 외부 API 권한 없을 때 0 정규화 반환 */
export class StubInsights implements InsightsSource {
  readonly name = "stub";
  async fetch(_postId: string): Promise<Insights> {
    return { reach: 0, saves: 0, comments: 0 };
  }
}

export function makePublisher(): Publisher {
  const { IG_USER_ID, IG_TOKEN, THREADS_USER_ID, THREADS_TOKEN } = process.env;
  if (IG_USER_ID && IG_TOKEN && THREADS_USER_ID && THREADS_TOKEN) {
    return new GraphApiPublisher(IG_USER_ID, IG_TOKEN, THREADS_USER_ID, THREADS_TOKEN);
  }
  return new DryRunPublisher();
}

export function makeInsights(): InsightsSource {
  const { IG_TOKEN } = process.env;
  return IG_TOKEN ? new GraphInsights(IG_TOKEN) : new StubInsights();
}
