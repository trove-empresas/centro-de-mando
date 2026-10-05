import type { TelegramClient } from "./env";

async function call(botToken: string, method: string, payload: unknown): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Sin contenido del mensaje ni del token en el registro.
    throw new Error(`Telegram ${method} falló: ${res.status}`);
  }
}

export function createTelegramClient(botToken: string): TelegramClient {
  return {
    async sendMessage(chatId, text, buttons) {
      const payload: Record<string, unknown> = { chat_id: chatId, text };
      if (buttons && buttons.length > 0) {
        payload.reply_markup = {
          inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))],
        };
      }
      await call(botToken, "sendMessage", payload);
    },
    async answerCallbackQuery(callbackQueryId, text) {
      await call(botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
    },
  };
}
