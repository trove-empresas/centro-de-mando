import type { PrMergeStatus } from "./merge";

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
  sendMessage(
    chatId: number,
    text: string,
    buttons?: InlineButton[],
    options?: { forceReply?: boolean },
  ): Promise<void>;
  /** Confirma al usuario que se ha recibido la pulsación de un botón. */
  answerCallbackQuery(callbackQueryId: string, text: string): Promise<void>;
}

/** Lo único que el bot necesita de GitHub; en las pruebas se sustituye por una simulación. */
export interface OpenItem {
  number: number;
  title: string;
  url: string;
  isPr: boolean;
  labels: string[];
}

export interface GitHubClient {
  /** Issues y PR abiertas de un repo (la API de GitHub las devuelve juntas). */
  listOpenItems(repo: string): Promise<OpenItem[]>;
  createIssue(repo: string, title: string, body: string): Promise<{ number: number; url: string }>;
  /** Publica un comentario en una PR (o issue). */
  addComment(repo: string, number: number, body: string): Promise<void>;
  /** Añade una etiqueta a una PR (o issue). */
  addLabel(repo: string, number: number, label: string): Promise<void>;
  /** Cierra una PR sin fusionarla (reversible: se puede reabrir). */
  closePullRequest(repo: string, number: number): Promise<void>;
  /** Estado de la PR y de sus comprobaciones, para decidir si se puede fusionar. */
  getPullRequestMergeStatus(repo: string, number: number): Promise<PrMergeStatus>;
  /** Fusiona la PR solo si su último commit sigue siendo `sha` (si alguien subió algo, falla). */
  mergePullRequest(repo: string, number: number, sha: string): Promise<void>;
}
