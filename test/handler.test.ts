import { describe, expect, it, vi } from "vitest";
import type { Env, GitHubClient, TelegramClient } from "../src/env";
import { handleTelegramWebhook } from "../src/handler";
import type { PrMergeStatus } from "../src/merge";

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
    return { client: { createIssue } as unknown as GitHubClient, createIssue };
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
      body: JSON.stringify({ callback_query: { id: "cb1", from: { id: userId }, data, message: { chat: { id: 77 } } } }),
    });

  it("Gonzalo pulsa «Aprobar» sin token de GitHub: no se hace nada y se explica", async () => {
    const t = fakeTelegram();
    const res = await handleTelegramWebhook(press("pr:a:criterio:7"), env, t.client);
    expect(res.status).toBe(200);
    expect(t.answerCallbackQuery).toHaveBeenCalledTimes(1);
    const [id, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(id).toBe("cb1");
    expect(text).toContain("falta el token");
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

describe("«Pedir cambios» y «Rechazar»", () => {
  function fakeGitHub(fail?: "comment" | "label" | "close") {
    const addComment = vi.fn(async () => {
      if (fail === "comment") throw new Error("x");
    });
    const addLabel = vi.fn(async () => {
      if (fail === "label") throw new Error("x");
    });
    const closePullRequest = vi.fn(async () => {
      if (fail === "close") throw new Error("x");
    });
    return { client: { addComment, addLabel, closePullRequest } as unknown as GitHubClient, addComment, addLabel, closePullRequest };
  }
  const post = (body: unknown) =>
    new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secreto-de-prueba" },
      body: JSON.stringify(body),
    });
  const press = (data: string, userId = 1001) =>
    post({ callback_query: { id: "cb1", from: { id: userId }, data, message: { chat: { id: 77 } } } });
  const prompt = "Escribe en respuesta a este mensaje el comentario para la PR criterio#7 (se publicará).";
  const reply = (text: string, over: { userId?: number; promptText?: string; fromBot?: boolean } = {}) =>
    post({
      message: {
        chat: { id: 77 },
        from: { id: over.userId ?? 1001 },
        text,
        reply_to_message: { text: over.promptText ?? prompt, from: { is_bot: over.fromBot ?? true } },
      },
    });

  it("«Pedir cambios» pide el comentario con respuesta forzada y no toca GitHub", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:c:criterio:7"), env, t.client, g.client);
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("criterio#7"), undefined, { forceReply: true });
    expect(g.addComment).not.toHaveBeenCalled();
    expect(g.addLabel).not.toHaveBeenCalled();
  });

  it("la respuesta publica el comentario y pone «corregir»", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(reply("Falta una prueba"), env, t.client, g.client);
    expect(g.addComment).toHaveBeenCalledWith("criterio", 7, "Falta una prueba");
    expect(g.addLabel).toHaveBeenCalledWith("criterio", 7, "corregir");
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("Hecho"));
  });

  it("respuesta de un usuario ajeno: nada ocurre", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(reply("hola", { userId: 9999 }), env, t.client, g.client);
    expect(g.addComment).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("respuesta a un mensaje que no es del bot: no se trata como comentario", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(reply("hola", { fromBot: false }), env, t.client, g.client);
    expect(g.addComment).not.toHaveBeenCalled();
  });

  it("repo fuera de la lista en la respuesta: nada ocurre", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    const promptText = "Escribe en respuesta a este mensaje el comentario para la PR otro-repo#7";
    await handleTelegramWebhook(reply("hola", { promptText }), env, t.client, g.client);
    expect(g.addComment).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("comentario vacío: no se publica nada", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(reply("   "), env, t.client, g.client);
    expect(g.addComment).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("vacío"));
  });

  it("si falla el comentario no se pone la etiqueta y se avisa", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub("comment");
    await handleTelegramWebhook(reply("algo"), env, t.client, g.client);
    expect(g.addLabel).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("No he podido"));
  });

  it("si falla la etiqueta se avisa de que hay que ponerla a mano", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub("label");
    await handleTelegramWebhook(reply("algo"), env, t.client, g.client);
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("a mano"));
  });

  it("«Rechazar» cierra la PR sin fusionar y lo confirma", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:r:criterio:7"), env, t.client, g.client);
    expect(g.closePullRequest).toHaveBeenCalledWith("criterio", 7);
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("sin fusionar");
  });

  it("«Rechazar» de un usuario ajeno o de un repo no permitido: nada ocurre", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:r:criterio:7", 9999), env, t.client, g.client);
    await handleTelegramWebhook(press("pr:r:otro-repo:7"), env, t.client, g.client);
    expect(g.closePullRequest).not.toHaveBeenCalled();
    expect(t.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it("«Rechazar» con fallo de GitHub avisa de que no se ha hecho nada", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub("close");
    await handleTelegramWebhook(press("pr:r:criterio:7"), env, t.client, g.client);
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("No he hecho nada");
  });

  it("«Rechazar» sin token de GitHub no actúa", async () => {
    const t = fakeTelegram();
    await handleTelegramWebhook(press("pr:r:criterio:7"), env, t.client);
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("falta el token");
  });
});

describe("«Aprobar»: segunda confirmación y comprobaciones en verde", () => {
  const verde: PrMergeStatus = {
    state: "open",
    merged: false,
    draft: false,
    base: "main",
    headSha: "abc123",
    mergeable: true,
    checks: [{ name: "pruebas", result: "success" }],
    checksTruncated: false,
  };
  function fakeGitHub(status: Partial<PrMergeStatus> = {}, fail?: "status" | "merge") {
    const getPullRequestMergeStatus = vi.fn(async () => {
      if (fail === "status") throw new Error("x");
      return { ...verde, ...status };
    });
    const mergePullRequest = vi.fn(async () => {
      if (fail === "merge") throw new Error("x");
    });
    return {
      client: { getPullRequestMergeStatus, mergePullRequest } as unknown as GitHubClient,
      getPullRequestMergeStatus,
      mergePullRequest,
    };
  }
  const press = (data: string, userId = 1001) =>
    new Request("https://ejemplo.test/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secreto-de-prueba" },
      body: JSON.stringify({ callback_query: { id: "cb1", from: { id: userId }, data, message: { chat: { id: 77 } } } }),
    });

  it("«Aprobar» con todo en verde pregunta «¿Fusionar PR …?» y NO fusiona", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:a:criterio:7"), env, t.client, g.client);
    expect(g.mergePullRequest).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledWith(
      77,
      expect.stringContaining("¿Fusionar PR criterio#7 en main?"),
      [
        { text: "✅ Sí, fusionar", data: "pr:m:criterio:7" },
        { text: "Cancelar", data: "pr:n:criterio:7" },
      ],
    );
  });

  it("«Sí, fusionar» con todo en verde fusiona sobre el commit comprobado", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client, g.client);
    expect(g.mergePullRequest).toHaveBeenCalledExactlyOnceWith("criterio", 7, "abc123");
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("fusionada");
  });

  it.each([
    ["en rojo", { checks: [{ name: "pruebas", result: "failure" as const }] }, "en rojo: pruebas"],
    ["pendientes", { checks: [{ name: "pruebas", result: "pending" as const }] }, "en curso: pruebas"],
    ["sin comprobaciones", { checks: [] }, "No hay comprobaciones"],
    ["con conflicto", { mergeable: false }, "conflictos"],
  ])("comprobaciones %s: ni pregunta ni fusiona, y explica por qué", async (_n, over, motivo) => {
    const t = fakeTelegram();
    const g = fakeGitHub(over);
    await handleTelegramWebhook(press("pr:a:criterio:7"), env, t.client, g.client);
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client, g.client);
    expect(g.mergePullRequest).not.toHaveBeenCalled();
    const sent = t.sendMessage.mock.calls as unknown as [number, string, unknown?][];
    expect(sent).toHaveLength(2);
    for (const [, text, buttons] of sent) {
      expect(text).toContain(motivo);
      expect(buttons).toBeUndefined();
    }
  });

  it("si el estado cambia a rojo entre las dos pulsaciones, la confirmación no fusiona", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub({ checks: [{ name: "pruebas", result: "failure" }] });
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client, g.client);
    expect(g.getPullRequestMergeStatus).toHaveBeenCalledTimes(1);
    expect(g.mergePullRequest).not.toHaveBeenCalled();
  });

  it("«Cancelar» no consulta ni toca nada en GitHub", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:n:criterio:7"), env, t.client, g.client);
    expect(g.getPullRequestMergeStatus).not.toHaveBeenCalled();
    expect(g.mergePullRequest).not.toHaveBeenCalled();
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("Cancelado");
  });

  it("usuario ajeno o repo no permitido: ignorado, no fusiona", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub();
    await handleTelegramWebhook(press("pr:m:criterio:7", 9999), env, t.client, g.client);
    await handleTelegramWebhook(press("pr:m:otro-repo:7"), env, t.client, g.client);
    await handleTelegramWebhook(press("pr:a:otro-repo:7"), env, t.client, g.client);
    expect(g.getPullRequestMergeStatus).not.toHaveBeenCalled();
    expect(g.mergePullRequest).not.toHaveBeenCalled();
    expect(t.answerCallbackQuery).not.toHaveBeenCalled();
    expect(t.sendMessage).not.toHaveBeenCalled();
  });

  it("sin token de GitHub la confirmación no actúa", async () => {
    const t = fakeTelegram();
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client);
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("falta el token");
  });

  it("si no se puede leer el estado, no fusiona y lo dice", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub({}, "status");
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client, g.client);
    expect(g.mergePullRequest).not.toHaveBeenCalled();
    const [, text] = t.answerCallbackQuery.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("No he hecho nada");
  });

  it("si GitHub rechaza la fusión, se avisa de que no ha cambiado nada", async () => {
    const t = fakeTelegram();
    const g = fakeGitHub({}, "merge");
    await handleTelegramWebhook(press("pr:m:criterio:7"), env, t.client, g.client);
    expect(t.sendMessage).toHaveBeenCalledWith(77, expect.stringContaining("No ha cambiado nada"));
  });
});
