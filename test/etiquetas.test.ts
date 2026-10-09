import { describe, expect, it, vi } from "vitest";
import type { Env, GitHubClient, TelegramClient } from "../src/env";
import { REQUIRED_LABELS, handleEtiquetasCommand, isEtiquetasCommand } from "../src/etiquetas";
import { createGitHubClient } from "../src/github";
import { handleTelegramWebhook } from "../src/handler";

// Todos los datos son inventados.
const gh = (impl: GitHubClient["createLabel"]) => {
  const createLabel = vi.fn(impl);
  return { client: { createLabel } as unknown as GitHubClient, createLabel };
};

describe("/etiquetas", () => {
  it("reconoce el comando", () => {
    expect(isEtiquetasCommand("/etiquetas")).toBe(true);
    expect(isEtiquetasCommand("/etiquetas@MiBot")).toBe(true);
    expect(isEtiquetasCommand("/etiquetasx")).toBe(false);
  });

  it("crea las dos etiquetas si faltan", async () => {
    const g = gh(async () => true);
    const { reply } = await handleEtiquetasCommand(["repo-a"], g.client);
    expect(g.createLabel.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["repo-a", "necesita-gonzalo"],
      ["repo-a", "corregir"],
    ]);
    expect(REQUIRED_LABELS.map((l) => l.name)).toEqual(["necesita-gonzalo", "corregir"]);
    expect(reply).toContain("repo-a: creadas «necesita-gonzalo», «corregir»");
  });

  it("no falla si ya existen", async () => {
    const g = gh(async () => false);
    const { reply } = await handleEtiquetasCommand(["repo-a"], g.client);
    expect(reply).toBe("repo-a: ya tenía todas las etiquetas.");
  });

  it("solo actúa en los repos de la lista", async () => {
    const g = gh(async () => true);
    await handleEtiquetasCommand(["repo-a", "repo-b"], g.client);
    expect(new Set(g.createLabel.mock.calls.map((c) => c[0]))).toEqual(new Set(["repo-a", "repo-b"]));
  });

  it("si GitHub falla en un repo lo dice y sigue con los demás", async () => {
    const g = gh(async (repo) => {
      if (repo === "repo-a") throw new Error("GitHub createLabel falló: 403");
      return true;
    });
    const { reply } = await handleEtiquetasCommand(["repo-a", "repo-b"], g.client);
    expect(reply).toContain("repo-a: no he podido crear «necesita-gonzalo»");
    expect(reply).toContain("repo-b: creadas");
  });

  it("sin token de GitHub no hace nada y lo dice", async () => {
    const { reply } = await handleEtiquetasCommand(["repo-a"], undefined);
    expect(reply).toContain("falta el token");
  });
});

describe("cliente de GitHub: createLabel", () => {
  const withFetch = (res: Response) => vi.stubGlobal("fetch", vi.fn(async () => res));

  it("devuelve true si la crea y false si ya existía (422 already_exists)", async () => {
    withFetch(new Response("{}", { status: 201 }));
    expect(await createGitHubClient("t").createLabel("r", "x", "ffffff", "d")).toBe(true);
    withFetch(new Response(JSON.stringify({ errors: [{ code: "already_exists" }] }), { status: 422 }));
    expect(await createGitHubClient("t").createLabel("r", "x", "ffffff", "d")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("lanza error (sin token) ante otros fallos", async () => {
    withFetch(new Response("{}", { status: 403 }));
    await expect(createGitHubClient("secreto").createLabel("r", "x", "ffffff", "d")).rejects.toThrow("403");
    withFetch(new Response(JSON.stringify({ errors: [{ code: "invalid" }] }), { status: 422 }));
    await expect(createGitHubClient("t").createLabel("r", "x", "ffffff", "d")).rejects.toThrow("422");
    vi.unstubAllGlobals();
  });
});

describe("/etiquetas por Telegram", () => {
  const env: Env = {
    TELEGRAM_WEBHOOK_SECRET: "s",
    TELEGRAM_ALLOWED_USER_ID: "1001",
    GITHUB_ALLOWED_REPOS: "repo-a",
  };
  const send = async (userId: number, g: GitHubClient) => {
    const sendMessage = vi.fn(async () => {});
    const telegram = { sendMessage, answerCallbackQuery: vi.fn() } as unknown as TelegramClient;
    const body = JSON.stringify({ message: { chat: { id: 77 }, from: { id: userId }, text: "/etiquetas" } });
    const req = new Request("https://ejemplo.test/t", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "s" },
      body,
    });
    await handleTelegramWebhook(req, env, telegram, g);
    return sendMessage;
  };

  it("lo ejecuta Gonzalo y responde", async () => {
    const g = gh(async () => true);
    const sendMessage = await send(1001, g.client);
    expect(g.createLabel).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("repo-a: creadas"));
  });

  it("ignora a un usuario ajeno sin hacer nada", async () => {
    const g = gh(async () => true);
    const sendMessage = await send(9999, g.client);
    expect(g.createLabel).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
