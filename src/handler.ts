import type { Env, GitHubClient, TelegramClient } from "./env";
import { handleEstadoCommand, isEstadoCommand } from "./estado";
import { handleIssueCommand, isIssueCommand } from "./issue";
import { canMerge, MERGE_BASE } from "./merge";
import { changesPrompt, mergeConfirmButtons, parseChangesPrompt, parsePrButton } from "./pr-buttons";
import { allowedRepos } from "./repos";

const SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

interface TelegramUpdate {
  callback_query?: { id?: string; from?: { id?: number }; data?: string; message?: { chat?: { id?: number } } };
  message?: {
    chat?: { id?: number };
    from?: { id?: number };
    text?: string;
    reply_to_message?: { text?: string; from?: { is_bot?: boolean } };
  };
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
    return handleButton(update.callback_query, env, telegram, github);
  }
  const fromId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (fromId === undefined || chatId === undefined || String(fromId) !== env.TELEGRAM_ALLOWED_USER_ID) {
    return new Response(null, { status: 200 });
  }

  const text = update.message?.text ?? "";

  // Respuesta al aviso de «Pedir cambios»: el comentario va a la PR con la etiqueta «corregir».
  const asked = parseChangesPrompt(update.message?.reply_to_message?.text ?? "");
  if (asked && update.message?.reply_to_message?.from?.is_bot === true) {
    if (!allowedRepos(env.GITHUB_ALLOWED_REPOS).includes(asked.repo)) return new Response(null, { status: 200 });
    await telegram.sendMessage(chatId, await requestChanges(asked.repo, asked.number, text, github));
    return new Response(null, { status: 200 });
  }

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

/** Publica el comentario y pone «corregir»; devuelve el mensaje para Gonzalo (nunca lanza). */
async function requestChanges(repo: string, number: number, comment: string, github?: GitHubClient): Promise<string> {
  const text = comment.trim();
  if (text === "") return "El comentario está vacío: no he hecho nada. Pulsa «Pedir cambios» otra vez.";
  if (!github) return "No puedo actuar sobre GitHub: falta el token. No he hecho nada.";
  try {
    await github.addComment(repo, number, text);
  } catch {
    return `No he podido publicar el comentario en ${repo}#${number}. No he hecho nada más.`;
  }
  try {
    await github.addLabel(repo, number, "corregir");
  } catch {
    return `Comentario publicado en ${repo}#${number}, pero no he podido poner la etiqueta «corregir». Ponla a mano.`;
  }
  return `Hecho: comentario publicado en ${repo}#${number} y etiqueta «corregir» puesta.`;
}

/** Pulsación de un botón: se revalida usuario y repo antes de actuar. «Aprobar» pide una segunda confirmación y solo «Sí, fusionar» fusiona. */
async function handleButton(
  query: NonNullable<TelegramUpdate["callback_query"]>,
  env: Env,
  telegram: TelegramClient,
  github?: GitHubClient,
): Promise<Response> {
  const ignored = new Response(null, { status: 200 });
  if (query.id === undefined || query.from?.id === undefined) return ignored;
  if (String(query.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) return ignored;
  const button = parsePrButton(query.data ?? "");
  if (!button || !allowedRepos(env.GITHUB_ALLOWED_REPOS).includes(button.repo)) return ignored;
  const ref = `${button.repo}#${button.number}`;

  if (button.action === "changes") {
    const chatId = query.message?.chat?.id;
    if (chatId === undefined) return ignored;
    await telegram.answerCallbackQuery(query.id, "Te pido el comentario.");
    await telegram.sendMessage(chatId, changesPrompt(button.repo, button.number), undefined, { forceReply: true });
    return ignored;
  }

  if (button.action === "reject") {
    if (!github) {
      await telegram.answerCallbackQuery(query.id, "No puedo actuar sobre GitHub: falta el token. No he hecho nada.");
      return ignored;
    }
    try {
      await github.closePullRequest(button.repo, button.number);
    } catch {
      await telegram.answerCallbackQuery(query.id, `No he podido cerrar ${ref}. No he hecho nada.`);
      return ignored;
    }
    await telegram.answerCallbackQuery(query.id, `PR ${ref} cerrada sin fusionar. Se puede reabrir en GitHub.`);
    return ignored;
  }

  const chatId = query.message?.chat?.id;
  if (chatId === undefined) return ignored;

  if (button.action === "cancel") {
    await telegram.answerCallbackQuery(query.id, `Cancelado. ${ref} sigue como estaba.`);
    return ignored;
  }

  if (!github) {
    await telegram.answerCallbackQuery(query.id, "No puedo actuar sobre GitHub: falta el token. No he hecho nada.");
    return ignored;
  }

  // «Aprobar» y «Sí, fusionar» comprueban el estado en el momento (el de la primera pulsación puede haber cambiado).
  let status;
  try {
    status = await github.getPullRequestMergeStatus(button.repo, button.number);
  } catch {
    await telegram.answerCallbackQuery(query.id, `No he podido leer el estado de ${ref}. No he hecho nada.`);
    return ignored;
  }
  const decision = canMerge(status);
  if (!decision.ok) {
    await telegram.answerCallbackQuery(query.id, `No fusiono ${ref}.`);
    await telegram.sendMessage(chatId, `No fusiono ${ref}. ${decision.reason}`);
    return ignored;
  }

  if (button.action === "approve") {
    await telegram.answerCallbackQuery(query.id, "Comprobaciones en verde. Falta tu confirmación.");
    await telegram.sendMessage(
      chatId,
      `¿Fusionar PR ${ref} en ${MERGE_BASE}? Las comprobaciones están en verde. Solo se fusiona si pulsas «Sí, fusionar».`,
      mergeConfirmButtons(button.repo, button.number),
    );
    return ignored;
  }

  // button.action === "confirm": se fusiona sobre el commit que se acaba de comprobar.
  try {
    await github.mergePullRequest(button.repo, button.number, status.headSha);
  } catch {
    await telegram.answerCallbackQuery(query.id, `No he podido fusionar ${ref}. No ha cambiado nada.`);
    await telegram.sendMessage(
      chatId,
      `No he podido fusionar ${ref} (puede que alguien haya subido cambios o que falte permiso). No ha cambiado nada.`,
    );
    return ignored;
  }
  await telegram.answerCallbackQuery(query.id, `PR ${ref} fusionada en ${MERGE_BASE}.`);
  return ignored;
}
