import type { Env } from "./env";
import { handleTelegramWebhook } from "./handler";
import { createTelegramClient } from "./telegram";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/telegram" && env.TELEGRAM_BOT_TOKEN) {
      return handleTelegramWebhook(request, env, createTelegramClient(env.TELEGRAM_BOT_TOKEN));
    }
    return new Response("Not Found", { status: 404 });
  },
};
