import type { Env, GitHubClient, TelegramClient } from "./env";
import { handleEstadoCommand, isEstadoCommand } from "./estado";
import { handleIssueCommand, isIssueCommand } from "./issue";
import { parsePrButton } from "./pr-buttons";
import { allowedRepos } from "./repos";

const SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

interface TelegramUpdate {
  callback_query?: { id?: string; from?: { id?: number }; data?: string };
  message?: { chat?: { id?: number }; from?: { id?: number }; text?: string };
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  telegram: TelegramClient,
  github?: GitHubClient,
): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Sin configuración completa no se procesa nada (fallar cerrado).
  if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_ALLOWED_USER_ID) {
    return new Response("Not configured", { status: 500 });
  }

  // 1) Secreto de Telegram, ANTES de leer el contenido.
  const received = request.headers.get(SECRET_HEADER);
  if (received === null || !safeEqual(received, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // 2) Solo Gonzalo: cualquier otro usuario se ignora sin responder.
  if (update.callback_query) {
    return handleButton(update.callback_query, env, telegram);
  }
  const fromId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (fromId === undefined || chatId === undefined || String(fromId) !== env.TELEGRAM_ALLOWED_USER_ID) {
    return new Response(null, { status: 200 });
  }

  const text = update.message?.text ?? "";
  if (isIssueCommand(text)) {
    const { reply } = await handleIssueCommand(text, allowedRepos(env.GITHUB_ALLOWED_REPOS), github);
    await telegram.sendMessage(chatId, reply);
    return new Response(null, { status: 200 });
  }

  if (isEstadoCommand(text)) {
    const { reply } = await handleEstadoCommand(allowedRepos(env.GITHUB_ALLOWED_REPOS), github);
    await telegram.sendMessage(chatId, reply);
    return new Response(null, { status: 200 });
  }

  await telegram.sendMessage(chatId, "ok");
  return new Response(null, { status: 200 });
}

/** Pulsación de un botón: se revalida usuario y repo; en esta versión solo se confirma la recepción. */
async function handleButton(
  query: NonNullable<TelegramUpdate["callback_query"]>,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const ignored = new Response(null, { status: 200 });
  if (query.id === undefined || query.from?.id === undefined) return ignored;
  if (String(query.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) return ignored;
  const button = parsePrButton(query.data ?? "");
  if (!button || !allowedRepos(env.GITHUB_ALLOWED_REPOS).includes(button.repo)) return ignored;
  await telegram.answerCallbackQuery(query.id, `Recibido (${button.repo}#${button.number}). La acción aún no está disponible.`);
  return ignored;
}
