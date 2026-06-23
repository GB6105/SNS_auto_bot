// 승인 스케줄러: awaiting_approval 레코드를 훑어 리마인드 1회 후 만료(폐기). 자동 게시 절대 없음.
import type { ContentRecord, Store } from "../store/store.js";
import type { ApprovalPreview, Notifier } from "./telegram.js";
import {
  type ApprovalPolicy,
  type Clock,
  DEFAULT_POLICY,
  pendingAction,
  systemClock,
  transition,
} from "./approval.js";

/** 레코드 → 승인 미리보기 */
export function recordToPreview(rec: ContentRecord): ApprovalPreview {
  const p: ApprovalPreview = { date: rec.date, copy: rec.copy, checklist: rec.checklist };
  if (rec.images && rec.images.length > 0) p.designRef = rec.images.map((i) => i.path).join(", ");
  else if (rec.slots) p.designRef = "(슬롯 생성됨)";
  return p;
}

export interface TickSummary {
  reminded: string[];
  expired: string[];
}

/**
 * 대기 중 레코드에 대해 경과 시간 기준 액션 수행.
 * - remind: 리마인드 알림 재전송 + reminded=true
 * - expire: discarded 전이
 * 결정적(주입 Clock). 자동 게시 없음.
 */
export async function tickPending(
  store: Store,
  notifier: Notifier,
  clock: Clock = systemClock,
  policy: ApprovalPolicy = DEFAULT_POLICY,
): Promise<TickSummary> {
  const summary: TickSummary = { reminded: [], expired: [] };
  const waiting = await store.byStatus("awaiting_approval");

  for (const rec of waiting) {
    if (rec.awaitingSinceMs === undefined) continue;
    const action = pendingAction(rec.awaitingSinceMs, clock, rec.reminded ?? false, policy);
    if (action === "remind") {
      await notifier.notify({ ...recordToPreview(rec), date: `${rec.date} (리마인드)` });
      await store.upsert({ ...rec, reminded: true });
      summary.reminded.push(rec.id);
    } else if (action === "expire") {
      await store.upsert({ ...rec, status: transition(rec.status, "expire") }); // discarded
      summary.expired.push(rec.id);
    }
  }
  return summary;
}
