// 텔레그램 콜백 → 상태 전이 + (승인 시) 게시. PRD §10 "게시" 버튼 = Webhook 트리거.
import type { ContentRecord, Store } from "../store/store.js";
import type { ImageHost } from "../design/imagehost.js";
import { canPublish, transition } from "./approval.js";
import type { Publisher, PublishResult } from "./publisher.js";

export type CallbackAction = "approve" | "revise" | "discard";

export interface WebhookDeps {
  store: Store;
  publisher: Publisher;
  host: ImageHost; // IG 공개 image_url 업로드
}

export interface CallbackResult {
  id: string;
  action: CallbackAction;
  status: ContentRecord["status"];
  publish?: PublishResult;
}

/**
 * 콜백 처리. approve→승인 후 게시까지, revise→재생성 대기, discard→폐기.
 * 게시는 canPublish(approved)에서만. 승인 없이는 절대 게시되지 않는다.
 */
export async function handleCallback(id: string, action: CallbackAction, deps: WebhookDeps): Promise<CallbackResult> {
  const rec = await deps.store.get(id);
  if (!rec) throw new Error(`레코드 없음: ${id}`);

  if (action === "discard") {
    const status = transition(rec.status, "discard"); // discarded
    await deps.store.upsert({ ...rec, status });
    return { id, action, status };
  }

  if (action === "revise") {
    const status = transition(rec.status, "revise"); // revise (재생성은 다음 생성 사이클에서)
    await deps.store.upsert({ ...rec, status });
    return { id, action, status };
  }

  // approve → approved → publish
  let status = transition(rec.status, "approve"); // approved
  if (!canPublish(status)) throw new Error(`게시 불가 상태: ${status}`);

  let publish: PublishResult;
  if (rec.platform === "instagram" && rec.copy.kind === "ig_card") {
    // 승인된 콘텐츠만 호스팅(폐기 콘텐츠 업로드 방지)
    const images = rec.images ?? [];
    const imageUrls: string[] = [];
    for (const img of images) imageUrls.push(await deps.host.upload(img));
    publish = await deps.publisher.publishCard(rec.copy.copy, imageUrls);
    const next = publish.posted ? transition(status, "publish") : status;
    await deps.store.upsert({ ...rec, status: next, imageUrls, postId: publish.postId });
    status = next;
  } else if (rec.platform === "threads" && rec.copy.kind === "thread") {
    publish = await deps.publisher.publishThread(rec.copy.copy);
    const next = publish.posted ? transition(status, "publish") : status;
    await deps.store.upsert({ ...rec, status: next, postId: publish.postId });
    status = next;
  } else {
    throw new Error(`게시 불가: platform=${rec.platform}, copy=${rec.copy.kind}`);
  }

  return { id, action, status, publish };
}
