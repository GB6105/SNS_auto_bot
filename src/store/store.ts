// 상태 영속화: 캘린더 항목 + 생성물 + 승인 상태를 저장. 재시작에도 유지.
import type { GeneratedCopy, Pillar, Platform, SlotStatus, ThreadTone } from "../domain/types.js";
import type { ChecklistReport } from "../guardrail/checklist.js";
import type { CopySlot } from "../design/slots.js";
import type { RenderedImage } from "../design/renderer.js";

/** 한 콘텐츠 단위의 전체 레코드 */
export interface ContentRecord {
  id: string; // 멱등 키: date:platform:pillar|tone
  date: string;
  platform: Platform;
  pillar?: Pillar;
  tone?: ThreadTone;
  topic?: string;
  copy: GeneratedCopy;
  checklist: ChecklistReport;
  slots?: CopySlot[];
  images?: RenderedImage[];
  imageUrls?: string[];
  status: SlotStatus;
  awaitingSinceMs?: number;
  reminded?: boolean;
  postId?: string;
}

/** 멱등 레코드 키 */
export function recordId(date: string, platform: Platform, kind: string): string {
  return `${date}:${platform}:${kind}`;
}

export interface Store {
  upsert(rec: ContentRecord): Promise<void>;
  get(id: string): Promise<ContentRecord | undefined>;
  all(): Promise<ContentRecord[]>;
  byStatus(status: SlotStatus): Promise<ContentRecord[]>;
}

/** 메모리 스토어 (테스트/일시 실행) */
export class MemoryStore implements Store {
  private readonly map = new Map<string, ContentRecord>();
  async upsert(rec: ContentRecord): Promise<void> {
    this.map.set(rec.id, rec);
  }
  async get(id: string): Promise<ContentRecord | undefined> {
    return this.map.get(id);
  }
  async all(): Promise<ContentRecord[]> {
    return [...this.map.values()];
  }
  async byStatus(status: SlotStatus): Promise<ContentRecord[]> {
    return [...this.map.values()].filter((r) => r.status === status);
  }
}

/**
 * JSON 파일 스토어. 단일 파일에 전체 맵을 직렬화. MVP 규모(월 200~300건)에 충분.
 * n8n/외부 DB 이전 시 같은 Store 인터페이스로 교체.
 */
export class JsonFileStore implements Store {
  constructor(
    private readonly path: string,
    private readonly readFile: (p: string) => Promise<string>,
    private readonly writeFile: (p: string, data: string) => Promise<void>,
  ) {}

  private async load(): Promise<Record<string, ContentRecord>> {
    try {
      return JSON.parse(await this.readFile(this.path)) as Record<string, ContentRecord>;
    } catch {
      return {};
    }
  }

  async upsert(rec: ContentRecord): Promise<void> {
    const data = await this.load();
    data[rec.id] = rec;
    await this.writeFile(this.path, JSON.stringify(data, null, 2));
  }
  async get(id: string): Promise<ContentRecord | undefined> {
    return (await this.load())[id];
  }
  async all(): Promise<ContentRecord[]> {
    return Object.values(await this.load());
  }
  async byStatus(status: SlotStatus): Promise<ContentRecord[]> {
    return Object.values(await this.load()).filter((r) => r.status === status);
  }
}
