// US-10 게시 어댑터(Publisher) + US-11 성과 수집(InsightsSource).
// 외부 비즈계정·앱심사·토큰 필요 → dry-run stub 우선.
import type { CardCopy, ThreadCopy } from "../domain/types.js";

export interface PublishResult {
  platform: "instagram" | "threads";
  posted: boolean;
  postId: string;
  dryRun: boolean;
  note?: string;
}

/** 게시 인터페이스 — 승인된 콘텐츠만 전달받는다(approval.canPublish로 게이트). */
export interface Publisher {
  readonly name: string;
  publishCard(copy: CardCopy, imageRef: string): Promise<PublishResult>;
  publishThread(copy: ThreadCopy): Promise<PublishResult>;
}

/** dry-run stub — 외부 자격증명 없이 흐름 검증. 실제 게시는 하지 않는다. */
export class DryRunPublisher implements Publisher {
  readonly name = "dry-run";
  private seq = 0;
  async publishCard(_copy: CardCopy, _imageRef: string): Promise<PublishResult> {
    return { platform: "instagram", posted: false, postId: `dry-ig-${++this.seq}`, dryRun: true, note: "DRY-RUN: 실제 게시 안 함" };
  }
  async publishThread(_copy: ThreadCopy): Promise<PublishResult> {
    return { platform: "threads", posted: false, postId: `dry-th-${++this.seq}`, dryRun: true, note: "DRY-RUN: 실제 게시 안 함" };
  }
}

/**
 * 실제 게시 어댑터 스켈레톤.
 * RALPH-BLOCKER: IG Graph API는 비즈/크리에이터 계정 + FB 페이지 연결 + 앱 심사(2~4주) + 장기 토큰 필요.
 *                Threads는 별도 API/토큰. 24h당 25건 게시 한도 주의.
 * 자격증명이 채워지면 fetch 호출부를 구현한다(현재는 미구현 → 차단 표기).
 */
export class GraphApiPublisher implements Publisher {
  readonly name = "graph-api";
  constructor(
    private readonly igUserId: string,
    private readonly igToken: string,
    private readonly threadsUserId: string,
    private readonly threadsToken: string,
  ) {}

  async publishCard(_copy: CardCopy, _imageRef: string): Promise<PublishResult> {
    // RALPH-BLOCKER: IG 2단계(미디어 컨테이너 생성 → publish) 구현은 앱 심사 통과 후.
    throw new Error(`GraphApiPublisher.publishCard 미구현 — IG 앱 심사/토큰 필요(igUserId=${this.igUserId ? "set" : "missing"}, igToken=${this.igToken ? "set" : "missing"})`);
  }
  async publishThread(_copy: ThreadCopy): Promise<PublishResult> {
    // RALPH-BLOCKER: Threads API 토큰 필요.
    throw new Error(`GraphApiPublisher.publishThread 미구현 — Threads API 토큰 필요(threadsUserId=${this.threadsUserId ? "set" : "missing"}, threadsToken=${this.threadsToken ? "set" : "missing"})`);
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

/** stub — 외부 API 권한 없을 때 0 정규화 반환 */
export class StubInsights implements InsightsSource {
  readonly name = "stub";
  // RALPH-BLOCKER: 실제 insights는 IG Graph API insights 권한 필요.
  async fetch(_postId: string): Promise<Insights> {
    return { reach: 0, saves: 0, comments: 0 };
  }
}

/** 환경에 맞는 Publisher 선택 */
export function makePublisher(): Publisher {
  const { IG_USER_ID, IG_TOKEN, THREADS_USER_ID, THREADS_TOKEN } = process.env;
  if (IG_USER_ID && IG_TOKEN && THREADS_USER_ID && THREADS_TOKEN) {
    return new GraphApiPublisher(IG_USER_ID, IG_TOKEN, THREADS_USER_ID, THREADS_TOKEN);
  }
  return new DryRunPublisher();
}
