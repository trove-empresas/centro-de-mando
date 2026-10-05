import type { TelegramClient } from "./env";

export function createTelegramClient(botToken: string): TelegramClient {
  return {
    async sendMessage(chatId, text) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) {
        // Sin contenido del mensaje ni del token en el registro.
        throw new Error(`Telegram sendMessage falló: ${res.status}`);
      }
    },
  };
}
