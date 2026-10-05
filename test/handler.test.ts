import { describe, expect, it, vi } from "vitest";
import type { Env, GitHubClient, TelegramClient } from "../src/env";
import { handleTelegramWebhook } from "../src/handler";

// Todos los datos son inventados.
const env: Env = {
  TELEGRAM_WEBHOOK_SECRET: "secreto-de-prueba",
  TELEGRAM_ALLOWED_USER_ID: "1001",
};

function fakeTelegram() {
  const sendMessage = vi.fn(async () => {});
  const answerCallbackQuery = vi.fn(async () => {});
  return { client: { sendMessage, answerCallbackQuery } as TelegramClient, sendMessage, answerCallbackQuery };
}

function req(opts: { secret?: string; userId?: number; method?: string; body?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== undefined) headers["X-Telegram-Bot-Api-Secret-Token"] = opts.secret;
  const body =
    opts.body ??
    JSON.stringify({ message: { chat: { id: 77 }, from: { id: opts.userId ?? 1001 }, text: "hola" } });
  return new Request("https://ejemplo.test/telegram", {
    method: opts.method ?? "POST",
    headers,
    body: (opts.method ?? "POST") === "POST" ? body : undefined,
  });
}

describe("webhook de Telegram", () => {
  it("responde «ok» al usuario autorizado", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({ secret: "secreto-de-prueba" }), env, t.client);
    expect(res.status).toBe(200);
    expect(t.sendMessage).toHaveBeenCalledWith(77, "ok");
  });

  it("ignora sin responder a un usuario ajeno", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(
      req({ secret: "secreto-de-prueba", userId: 9999 }),
      env,
      t.client,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("rechaza un secreto incorrecto sin procesar nada", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({ secret: "otro" }), env, t.client);
    expect(res.status).toBe(403);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("rechaza si falta la cabecera del secreto", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({}), env, t.client);
    expect(res.status).toBe(403);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("comprueba el secreto antes de leer el contenido (contenido ilegible con secreto malo → 403, no 400)", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({ secret: "otro", body: "no es json" }), env, t.client);
    expect(res.status).toBe(403);
  });

  it("con secreto correcto y contenido ilegible responde 400", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(
      req({ secret: "secreto-de-prueba", body: "no es json" }),
      env,
      t.client,
    );
    expect(res.status).toBe(400);
  });

  it("falla cerrado si falta configuración", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({ secret: "x" }), {}, t.client);
    expect(res.status).toBe(500);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("no acepta métodos distintos de POST", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(req({ method: "GET" }), env, t.client);
    expect(res.status).toBe(405);
  });
});

describe("/issue: crear una issue desde Telegram", () => {
  function fakeGitHub() {
    const createIssue = vi.fn(async (repo: string) => ({
      number: 42,
      url: `https://github.com/trove-empresas/${repo}/issues/42`,
    }));
    return { client: { createIssue } as GitHubClient, createIssue };
  }
  function msg(text: string, userId = 1001) {
    return req({
      secret: "secreto-de-prueba",
      body: JSON.stringify({ message: { chat: { id: 77 }, from: { id: userId }, text } }),
    });
  }

  it("crea la issue en el repo elegido (título = primera línea, resto = descripción)", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    const res = await handleTelegramWebhook(msg("/issue criterio Probar algo\nDetalle ficticio"), env, t.client, g.client);
    expect(res.status).toBe(200);
    expect(g.createIssue).toHaveBeenCalledWith("criterio", "Probar algo", "Detalle ficticio");
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("criterio#42"));
  });

  it("rechaza un repo fuera de la lista y no llama a GitHub", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(msg("/issue otro-repo Algo"), env, t.client, g.client);
    expect(g.createIssue).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("no está en la lista"));
  });

  it("usa la lista configurable GITHUB_ALLOWED_REPOS", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    const conf = { ...env, GITHUB_ALLOWED_REPOS: "trove-empresas/solo-este" };
    await handleTelegramWebhook(msg("/issue criterio Algo"), conf, t.client, g.client);
    expect(g.createIssue).not.toHaveBeenCalled();
    await handleTelegramWebhook(msg("/issue solo-este Algo"), conf, t.client, g.client);
    expect(g.createIssue).toHaveBeenCalledWith("solo-este", "Algo", "");
  });

  it("ignora a un usuario ajeno sin crear nada", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    const res = await handleTelegramWebhook(msg("/issue criterio Algo", 9999), env, t.client, g.client);
    expect(res.status).toBe(200);
    expect(g.createIssue).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("sin repo ni texto muestra la ayuda con la lista de repos", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(msg("/issue"), env, t.client, g.client);
    expect(g.createIssue).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("contabilidad-autonomo"));
  });

  it("si GitHub falla, lo dice y no afirma haber creado nada", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    g.createIssue.mockRejectedValueOnce(new Error("boom"));
    await handleTelegramWebhook(msg("/issue criterio Algo"), env, t.client, g.client);
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("No se ha creado nada"));
  });

  it("sin token de GitHub avisa de que no está configurado", async () => {
    const t = fakeTelegram();
    await handleTelegramWebhook(msg("/issue criterio Algo"), env, t.client);
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("no está configurado"));
  });
});

describe("botones de PR", () => {
  const press = (data: string, userId = 1001) =>
    new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secreto-de-prueba" },
      body: JSON.stringify({ callback_query: { id: "cb1", from: { id: userId }, data } }),
    });

  it("Gonzalo pulsa un botón válido: solo se confirma la recepción", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(press("pr:a:criterio:7"), env, t.client);
    expect(res.status).toBe(200);
    expect(t.answerCallbackQuery).toHaveBeenCalledTimes(1);
    const [id, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(id).toBe("cb1");
    expect(text).toContain("criterio#7");
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("pulsación de un usuario ajeno: ignorada sin responder", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(press("pr:a:criterio:7", 9999), env, t.client);
    expect(res.status).toBe(200);
    expect(t.answerCallbackQuery).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("repo que no está en la lista: ignorada", async () => {
    const t = fakeTelegram();
    await handleTelegramWebhook(press("pr:a:otro-repo:7"), env, t.client);
    expect(t.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it.each(["", "basura", "pr:x:criterio:7", "pr:a:criterio:abc", "pr:a:criterio/../x:7"])(
    "datos mal formados %j: ignorados",
    async (data) => {
      const t = fakeTelegram();
      await handleTelegramWebhook(press(data), env, t.client);
      expect(t.answerCallbackQuery).not.toHaveBeenCalled();
    },
  );

  it("secreto de Telegram incorrecto: rechazada la pulsación", async () => {
    const t = fakeTelegram();
    const r = new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "malo" },
      body: JSON.stringify({ callback_query: { id: "cb1", from: { id: 1001 }, data: "pr:a:criterio:7" } }),
    });
    const res = await handleTelegramWebhook(r, env, t.client);
    expect(res.status).toBe(403);
    expect(t.answerCallbackQuery).not.toHaveBeenCalled();
  });
});
