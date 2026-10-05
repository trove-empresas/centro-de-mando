import { describe, expect, it, vi } from "vitest";
import type { Env, TelegramClient } from "../src/env";
import { handleGitHubWebhook } from "../src/github-webhook";

// Todos los datos son inventados.
const env: Env = {
  GITHUB_WEBHOOK_SECRET: "secreto-github-de-prueba",
  TELEGRAM_ALLOWED_USER_ID: "1001",
};

function fakeTelegram() {
  const sendMessage = vi.fn(async () => {});
  return { client: { sendMessage } as TelegramClient, sendMessage };
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const labeled = (repo = "criterio", label = "necesita-gonzalo") =>
  JSON.stringify({
    action: "labeled",
    label: { name: label },
    issue: { number: 12, title: "Duda de prueba", html_url: `https://github.com/trove-empresas/${repo}/issues/12` },
    repository: { full_name: `trove-empresas/${repo}` },
  });

async function req(opts: { body?: string; signature?: string | null; event?: string; method?: string }) {
  const body = opts.body ?? labeled();
  const headers: Record<string, string> = { "x-github-event": opts.event ?? "issues" };
  const signature = opts.signature === undefined ? await sign(body, env.GITHUB_WEBHOOK_SECRET!) : opts.signature;
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  const method = opts.method ?? "POST";
  return new Request("https://ejemplo.test/github", { method, headers, body: method === "POST" ? body : undefined });
}

describe("webhook de GitHub", () => {
  it("firma válida + issue etiquetada con necesita-gonzalo: avisa por Telegram con el enlace", async () => {
    const t = fakeTelegram();
    const res = await handleGitHubWebhook(await req({}), env, t.client);
    expect(res.status).toBe(200);
    expect(t.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = t.sendMessage.mock.calls[0] as unknown as [number, string];
    expect(chatId).toBe(1001);
    expect(text).toContain("criterio#12");
    expect(text).toContain("https://github.com/trove-empresas/criterio/issues/12");
  });

  it("rechaza una firma falsa sin enviar nada", async () => {
    const t = fakeTelegram();
    const falsa = await sign(labeled(), "otro-secreto");
    const res = await handleGitHubWebhook(await req({ signature: falsa }), env, t.client);
    expect(res.status).toBe(401);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("rechaza una firma válida de otro contenido (cuerpo manipulado)", async () => {
    const t = fakeTelegram();
    const firmaOriginal = await sign(labeled("criterio"), env.GITHUB_WEBHOOK_SECRET!);
    const res = await handleGitHubWebhook(
      await req({ body: labeled("contabilidad-autonomo"), signature: firmaOriginal }),
      env,
      t.client,
    );
    expect(res.status).toBe(401);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("rechaza si falta la firma o tiene formato inválido, incluso con cuerpo no JSON", async () => {
    const t = fakeTelegram();
    expect((await handleGitHubWebhook(await req({ signature: null }), env, t.client)).status).toBe(401);
    expect((await handleGitHubWebhook(await req({ signature: "sha256=zz" }), env, t.client)).status).toBe(401);
    expect((await handleGitHubWebhook(await req({ signature: "abc" }), env, t.client)).status).toBe(401);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("falla cerrado si no hay secreto configurado", async () => {
    const t = fakeTelegram();
    const res = await handleGitHubWebhook(await req({}), { TELEGRAM_ALLOWED_USER_ID: "1001" }, t.client);
    expect(res.status).toBe(500);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("ignora un repo fuera de la lista", async () => {
    const t = fakeTelegram();
    const res = await handleGitHubWebhook(await req({ body: labeled("otro-repo") }), env, t.client);
    expect(res.status).toBe(200);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("respeta la lista configurable de repos", async () => {
    const t = fakeTelegram();
    const e = { ...env, GITHUB_ALLOWED_REPOS: "otro-repo" };
    await handleGitHubWebhook(await req({ body: labeled("otro-repo") }), e, t.client);
    expect(t.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("ignora otras etiquetas, otros eventos y el ping", async () => {
    const t = fakeTelegram();
    await handleGitHubWebhook(await req({ body: labeled("criterio", "corregir") }), env, t.client);
    await handleGitHubWebhook(await req({ event: "pull_request" }), env, t.client);
    const ping = await handleGitHubWebhook(await req({ event: "ping", body: "{}" }), env, t.client);
    expect(ping.status).toBe(200);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("no acepta otros métodos", async () => {
    const t = fakeTelegram();
    const res = await handleGitHubWebhook(await req({ method: "GET" }), env, t.client);
    expect(res.status).toBe(405);
  });

  it("firma válida pero cuerpo que no es JSON: 400 sin enviar nada", async () => {
    const t = fakeTelegram();
    const res = await handleGitHubWebhook(await req({ body: "no-json" }), env, t.client);
    expect(res.status).toBe(400);
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("no registra contenido ni secretos", async () => {
    const t = fakeTelegram();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await handleGitHubWebhook(await req({}), env, t.client);
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).not.toContain("Duda de prueba");
    expect(logged).not.toContain("secreto-github-de-prueba");
  });
});
