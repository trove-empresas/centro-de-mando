export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_USER_ID?: string;
}

/** Lo único que el bot necesita de Telegram; en las pruebas se sustituye por una simulación. */
export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<void>;
}
