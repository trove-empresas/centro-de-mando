import { describe, expect, it, vi } from "vitest";
import type { Env, GitHubClient, OpenItem, TelegramClient } from "../src/env";
import { handleEstadoCommand, isEstadoCommand } from "../src/estado";
import { handleTelegramWebhook } from "../src/handler";

// Todos los datos son inventados.
const item = (o: Partial<OpenItem> & { number: number }): OpenItem => ({
  title: "Algo",
  url: `https://ejemplo.test/${o.number}`,
  isPr: false,
  labels: [],
  ...o,
});

const gh = (impl: GitHubClient["listOpenItems"]): GitHubClient => ({
  createIssue: vi.fn(),
  addComment: vi.fn(),
  addLabel: vi.fn(),
  closePullRequest: vi.fn(),
  listOpenItems: vi.fn(impl),
});

describe("/estado", () => {
  it("reconoce el comando", () => {
    expect(isEstadoCommand("/estado")).toBe(true);
    expect(isEstadoCommand("/estado@MiBot")).toBe(true);
    expect(isEstadoCommand("/estadosuperior")).toBe(false);
  });

  it("lista issues y PR con enlaces y destaca necesita-gonzalo y corregir primero", async () => {
    const github = gh(async () => [
      item({ number: 1, title: "Normal" }),
      item({ number: 2, title: "Duda", labels: ["necesita-gonzalo"] }),
      item({ number: 3, title: "Cambio", isPr: true, labels: ["corregir"] }),
    ]);
    const { reply } = await handleEstadoCommand(["repo-a"], github);
    expect(reply).toContain("repo-a (3 abiertas)");
    expect(reply).toContain("PR #3: Cambio ⚠ corregir");
    expect(reply).toContain("Issue #2: Duda ⚠ necesita-gonzalo");
    expect(reply).toContain("https://ejemplo.test/1");
    expect(reply.indexOf("#2")).toBeLessThan(reply.indexOf("#1"));
    expect(reply.indexOf("#3")).toBeLessThan(reply.indexOf("#1"));
  });

  it("repo sin nada abierto", async () => {
    const { reply } = await handleEstadoCommand(["repo-a"], gh(async () => []));
    expect(reply).toBe("repo-a: nada abierto.");
  });

  it("si GitHub falla en un repo lo dice y sigue con los demás", async () => {
    const github = gh(async (repo) => {
      if (repo === "malo") throw new Error("500");
      return [item({ number: 5 })];
    });
    const { reply } = await handleEstadoCommand(["malo", "bueno"], github);
    expect(reply).toContain("malo: no he podido consultar GitHub");
    expect(reply).toContain("bueno (1 abiertas)");
  });

  it("sin token de GitHub lo dice", async () => {
    const { reply } = await handleEstadoCommand(["repo-a"], undefined);
    expect(reply).toContain("falta el token");
  });
});

describe("/estado por Telegram", () => {
  const env: Env = {
    TELEGRAM_WEBHOOK_SECRET: "s",
    TELEGRAM_ALLOWED_USER_ID: "1001",
    GITHUB_ALLOWED_REPOS: "repo-a",
  };
  const send = (userId: number) =>
    new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "s", "content-type": "application/json" },
      body: JSON.stringify({ message: { chat: { id: 77 }, from: { id: userId }, text: "/estado" } }),
    });

  it("responde al usuario autorizado", async () => {
    const sendMessage = vi.fn(async () => {});
    const t = { sendMessage, answerCallbackQuery: vi.fn() } as unknown as TelegramClient;
    await handleTelegramWebhook(send(1001), env, t, gh(async () => []));
    expect(sendMessage).toHaveBeenCalledWith(77, "repo-a: nada abierto.");
  });

  it("ignora a un usuario ajeno sin consultar GitHub", async () => {
    const sendMessage = vi.fn(async () => {});
    const github = gh(async () => []);
    const t = { sendMessage, answerCallbackQuery: vi.fn() } as unknown as TelegramClient;
    await handleTelegramWebhook(send(9999), env, t, github);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(github.listOpenItems).not.toHaveBeenCalled();
  });
});

describe("/estado con respuestas largas", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => item({ number: i + 1, title: `Tarea número ${i + 1} con un título largo para ocupar espacio` }));

  it("trocea en varios mensajes de como máximo 4096 caracteres sin cortar entradas", async () => {
    const { parts } = await handleEstadoCommand(["repo-a", "repo-b"], gh(async () => many(150)));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4096);
    const all = parts.join("\n");
    for (let n = 1; n <= 150; n++) {
      // Cada entrada llega entera: su título y su enlace en el mismo mensaje.
      const entry = `Issue #${n}: Tarea número ${n} con un título largo para ocupar espacio\n  https://ejemplo.test/${n}`;
      expect(parts.some((p) => p.includes(entry))).toBe(true);
    }
    expect(all).toContain("repo-b (150 abiertas)");
  });

  it("una respuesta corta sigue siendo un solo mensaje igual a reply", async () => {
    const { reply, parts } = await handleEstadoCommand(["repo-a"], gh(async () => many(2)));
    expect(parts).toEqual([reply]);
  });

  it("por Telegram envía cada trozo como un mensaje", async () => {
    const env: Env = { TELEGRAM_WEBHOOK_SECRET: "s", TELEGRAM_ALLOWED_USER_ID: "1001", GITHUB_ALLOWED_REPOS: "repo-a" };
    const req = new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "s", "content-type": "application/json" },
      body: JSON.stringify({ message: { chat: { id: 77 }, from: { id: 1001 }, text: "/estado" } }),
    });
    const sendMessage = vi.fn(async () => {});
    const t = { sendMessage, answerCallbackQuery: vi.fn() } as unknown as TelegramClient;
    await handleTelegramWebhook(req, env, t, gh(async () => many(150)));
    expect(sendMessage.mock.calls.length).toBeGreaterThan(1);
    for (const call of sendMessage.mock.calls as unknown as [number, string][]) {
      expect(call[0]).toBe(77);
      expect(call[1].length).toBeLessThanOrEqual(4096);
    }
  });
});
