export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_USER_ID?: string;
  GITHUB_TOKEN?: string;
  /** Secreto con el que GitHub firma sus avisos (webhook). */
  GITHUB_WEBHOOK_SECRET?: string;
  /** Repos permitidos, separados por comas (nombre corto o «dueño/repo»). Si falta, se usa la lista por defecto. */
  GITHUB_ALLOWED_REPOS?: string;
}

/** Botón bajo un mensaje; `data` vuelve en la pulsación (máx. 64 bytes). */
export interface InlineButton {
  text: string;
  data: string;
}

/** Lo único que el bot necesita de Telegram; en las pruebas se sustituye por una simulación. */
export interface TelegramClient {
  sendMessage(chatId: number, text: string, buttons?: InlineButton[]): Promise<void>;
  /** Confirma al usuario que se ha recibido la pulsación de un botón. */
  answerCallbackQuery(callbackQueryId: string, text: string): Promise<void>;
}

/** Lo único que el bot necesita de GitHub; en las pruebas se sustituye por una simulación. */
export interface GitHubClient {
  createIssue(repo: string, title: string, body: string): Promise<{ number: number; url: string }>;
}
