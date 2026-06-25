// 저수준 Telegram Bot API 클라이언트. Notifier/봇 폴링 루프가 공유.
export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
  message?: { message_id: number; chat: { id: number }; text?: string };
}

/** Telegram Bot API 래퍼. fetchFn 주입으로 테스트 가능. */
export class TelegramApi {
  constructor(private readonly token: string, private readonly fetchFn: typeof fetch = fetch) {}

  private async call<T = any>(method: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) throw new Error(`Telegram ${method} 실패: ${data.description ?? res.status}`);
    return data.result as T;
  }

  /** multipart/form-data 호출(파일 업로드용). content-type은 fetch가 boundary와 함께 설정. */
  private async callForm<T = any>(method: string, form: FormData): Promise<T> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", body: form });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) throw new Error(`Telegram ${method} 실패: ${data.description ?? res.status}`);
    return data.result as T;
  }

  /** 토큰 검증 + 봇 정보 */
  getMe(): Promise<{ id: number; username?: string; first_name?: string }> {
    return this.call("getMe");
  }

  /** 메시지 전송. 버튼 있으면 inline keyboard 부착. message_id 반환. */
  async sendMessage(chatId: string | number, text: string, buttons?: InlineButton[]): Promise<number> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (buttons) body.reply_markup = { inline_keyboard: [buttons] };
    const r = await this.call<{ message_id: number }>("sendMessage", body);
    return r.message_id;
  }

  /** 여러 이미지를 한 앨범으로 전송(캐러셀 미리보기). 텔레그램은 PNG/JPEG만 인라인 렌더. */
  async sendMediaGroup(chatId: string | number, photos: Array<{ bytes: Uint8Array; filename: string; mime: string }>): Promise<void> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    const media = photos.map((_p, i) => ({ type: "photo", media: `attach://f${i}` }));
    form.append("media", JSON.stringify(media));
    photos.forEach((p, i) => {
      const blob = new Blob([p.bytes as unknown as BlobPart], { type: p.mime });
      form.append(`f${i}`, blob, p.filename);
    });
    await this.callForm("sendMediaGroup", form);
  }

  /** 콜백 응답(버튼 로딩 스피너 종료) */
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    return this.call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  /** 기존 메시지 텍스트 수정(결정 결과 피드백). 버튼은 제거. */
  editMessageText(chatId: string | number, messageId: number, text: string): Promise<unknown> {
    return this.call("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } });
  }

  /** 롱폴링으로 업데이트 수신. offset 이후, timeout초 동안 대기. */
  getUpdates(offset: number, timeoutSec = 30): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["callback_query"] });
  }
}
