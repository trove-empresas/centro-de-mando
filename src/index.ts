import type { Env } from "./env";
import { handleGitHubWebhook } from "./github-webhook";
import { handleTelegramWebhook } from "./handler";
import { createGitHubClient } from "./github";
import { createTelegramClient } from "./telegram";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/telegram" && env.TELEGRAM_BOT_TOKEN) {
      return handleTelegramWebhook(
        request,
        env,
        createTelegramClient(env.TELEGRAM_BOT_TOKEN),
        env.GITHUB_TOKEN ? createGitHubClient(env.GITHUB_TOKEN) : undefined,
      );
    }
    if (pathname === "/github" && env.TELEGRAM_BOT_TOKEN) {
      return handleGitHubWebhook(request, env, createTelegramClient(env.TELEGRAM_BOT_TOKEN));
    }
    return new Response("Not Found", { status: 404 });
  },
};
