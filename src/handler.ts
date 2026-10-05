import type { Env, TelegramClient } from "./env";

const SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

interface TelegramUpdate {
  message?: { chat?: { id?: number }; from?: { id?: number } };
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
  const fromId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (fromId === undefined || chatId === undefined || String(fromId) !== env.TELEGRAM_ALLOWED_USER_ID) {
    return new Response(null, { status: 200 });
  }

  await telegram.sendMessage(chatId, "ok");
  return new Response(null, { status: 200 });
}
