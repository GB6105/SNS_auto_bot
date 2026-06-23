// US-5: Claude API 클라이언트 + 오프라인 stub. 모델 env 외부화(Devil#7).
import type { Pillar, ThreadTone } from "../domain/types.js";

export type GenPurpose = "ig_card" | "thread";

export interface LLMRequest {
  system: string;
  user: string;
  /** stub 분기 및 로깅용 */
  purpose: GenPurpose;
  /** 결정적 stub용 컨텍스트 */
  context: { pillar?: Pillar; tone?: ThreadTone; topic?: string };
  maxTokens?: number;
}

/** 모든 LLM 구현이 만족하는 단일 인터페이스. JSON 문자열을 반환한다. */
export interface LLM {
  readonly name: string;
  complete(req: LLMRequest): Promise<string>;
}

/** 기본 모델: 비용 민감 운영 권장(Devil#7). env(CLAUDE_MODEL)로 override. */
const FALLBACK_MODEL = "claude-sonnet-4-6";

/**
 * 실제 Claude API 클라이언트. ANTHROPIC_API_KEY 있을 때만 사용.
 * SDK 없이 내장 fetch로 호출 — 의존성 최소화(engineer-analysis).
 */
export class ClaudeClient implements LLM {
  readonly name = "claude";
  constructor(
    private readonly apiKey: string,
    private readonly model = FALLBACK_MODEL,
    private readonly timeoutMs = 30_000,
    private readonly maxRetries = 2,
  ) {}

  async complete(req: LLMRequest): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: req.maxTokens ?? 1500,
            system: req.system,
            messages: [{ role: "user", content: req.user }],
          }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
        return text.trim();
      } catch (err) {
        lastErr = err;
        if (attempt === this.maxRetries) break;
        // 간단 백오프 (테스트 비대상 — 실호출 시에만)
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`Claude 호출 실패: ${String(lastErr)}`);
  }
}

/**
 * 오프라인 결정적 stub. 키가 없을 때 사용 — 개발/테스트가 외부 키 없이 동작.
 * 실제 카피 품질만 차단되고 전체 파이프라인 흐름은 그대로 검증 가능.
 */
export class StubLLM implements LLM {
  readonly name = "stub";

  async complete(req: LLMRequest): Promise<string> {
    if (req.purpose === "ig_card") return JSON.stringify(this.igCard(req));
    return JSON.stringify(this.thread(req));
  }

  private igCard(req: LLMRequest): unknown {
    const topic = req.context.topic ?? "흐릿한 목표를 첫 행동으로";
    return {
      cards: [
        `${topic}`, // headline
        "추상적인 '열심히'는 멈춤을 부른다",
        "할 일을 '지금 할 첫 한 가지'로 쪼갠다",
        "5분이면 끝나는 행동부터 손에 잡는다",
        "끊겨도 '복귀 기준' 한 줄이 다시 시작하게 한다",
        "오늘의 첫 행동을 댓글에 적어보기 →", // cta
      ],
      caption: `${topic}\n\n흐릿한 목표는 시작을 막습니다. 지금 할 첫 한 가지로 쪼개보세요.\n\n※ 의학적 조언이 아닙니다. 진단·치료는 전문가와 상담하세요.\n#ADHD #성인ADHD #실행기능 #ADHD플래너`,
      hashtags: ["#ADHD", "#성인ADHD", "#실행기능", "#ADHD플래너"],
      disclaimer: "의학적 조언이 아닙니다. 진단·치료는 전문가와 상담하세요.",
    };
  }

  private thread(req: LLMRequest): unknown {
    const tone = req.context.tone ?? "serious";
    const byTone: Record<ThreadTone, string> = {
      serious: "흐릿한 목표는 멈춤을 부른다. 오늘은 '지금 할 첫 한 가지'만 정해보자. 책상 위 컵 하나를 싱크대에 두는 것부터.",
      casual_promo: "플래너 만들면서 겪은 것: 기능을 더 넣을수록 내가 안 쓰더라. 그래서 '다음 한 가지'만 보이게 갈아엎었다.",
      question: "할 일 목록을 보면 어디서부터 막히나요? 저는 '제일 쉬운 것'에서 자꾸 멈춰요. 여러분은 어디서 멈추세요?",
      empathy_short: "방금 뭐 하려 했더라, 하고 멈춘 다섯 번째. 그래도 괜찮아요. 지금 한 가지만.",
    };
    return { text: byTone[tone], tone };
  }
}

/** 환경에 맞는 LLM 선택. 키 있으면 Claude, 없으면 stub. */
export function makeLLM(): LLM {
  const key = process.env.ANTHROPIC_API_KEY;
  // RALPH-BLOCKER: 실 카피 품질은 ANTHROPIC_API_KEY 필요. 없으면 stub로 동작(개발/테스트 가능).
  if (!key) return new StubLLM();
  return new ClaudeClient(key, process.env.CLAUDE_MODEL ?? FALLBACK_MODEL);
}
