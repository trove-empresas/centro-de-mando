import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "../src/github";
import { canMerge, type PrMergeStatus } from "../src/merge";

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

describe("canMerge (falla cerrado)", () => {
  it("todo en verde: se puede", () => {
    expect(canMerge(verde)).toEqual({ ok: true });
  });

  it.each([
    ["ya fusionada", { merged: true, state: "closed" as const }, "ya está fusionada"],
    ["cerrada", { state: "closed" as const }, "cerrada"],
    ["borrador", { draft: true }, "borrador"],
    ["no va a main", { base: "otra" }, "no va a main"],
    ["conflicto", { mergeable: false }, "conflictos"],
    ["cálculo sin terminar", { mergeable: null }, "calculando"],
    ["demasiadas comprobaciones", { checksTruncated: true }, "demasiadas"],
    ["sin comprobaciones", { checks: [] }, "No hay comprobaciones"],
    ["una en rojo entre verdes", { checks: [{ name: "a", result: "success" as const }, { name: "b", result: "failure" as const }] }, "rojo: b"],
    ["una en curso", { checks: [{ name: "a", result: "success" as const }, { name: "c", result: "pending" as const }] }, "en curso: c"],
  ])("%s: no se puede", (_n, over, motivo) => {
    const d = canMerge({ ...verde, ...over });
    expect(d.ok).toBe(false);
    expect(d.ok ? "" : d.reason).toContain(motivo);
  });
});

describe("cliente de GitHub: estado y fusión (con fetch simulado)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(routes: Record<string, unknown>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const key = Object.keys(routes).find((k) => url.includes(k));
        return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response("{}", { status: 404 });
      }),
    );
    return calls;
  }

  const pr = { state: "open", merged: false, draft: false, mergeable: true, base: { ref: "main" }, head: { sha: "abc123" } };

  it("traduce check runs y estados: éxito/neutral/saltado = verde, en curso = pendiente, el resto = rojo", async () => {
    stub({
      "/pulls/7": pr,
      "/check-runs": {
        total_count: 4,
        check_runs: [
          { name: "a", status: "completed", conclusion: "success" },
          { name: "b", status: "completed", conclusion: "skipped" },
          { name: "c", status: "in_progress", conclusion: null },
          { name: "d", status: "completed", conclusion: "cancelled" },
        ],
      },
      "/status": { statuses: [{ context: "e", state: "error" }, { context: "f", state: "success" }] },
    });
    const s = await createGitHubClient("tok").getPullRequestMergeStatus("criterio", 7);
    expect(s.headSha).toBe("abc123");
    expect(s.checks).toEqual([
      { name: "a", result: "success" },
      { name: "b", result: "success" },
      { name: "c", result: "pending" },
      { name: "d", result: "failure" },
      { name: "e", result: "failure" },
      { name: "f", result: "success" },
    ]);
    expect(s.checksTruncated).toBe(false);
  });

  it("marca como truncado si hay más comprobaciones de las leídas", async () => {
    stub({
      "/pulls/7": pr,
      "/check-runs": { total_count: 150, check_runs: [{ name: "a", status: "completed", conclusion: "success" }] },
      "/status": { statuses: [] },
    });
    const s = await createGitHubClient("tok").getPullRequestMergeStatus("criterio", 7);
    expect(s.checksTruncated).toBe(true);
    expect(canMerge(s).ok).toBe(false);
  });

  it("un error de GitHub se propaga sin token en el mensaje", async () => {
    stub({});
    await expect(createGitHubClient("tok-secreto").getPullRequestMergeStatus("criterio", 7)).rejects.toThrow(
      /getPullRequest falló: 404$/,
    );
  });

  it("la fusión pide el commit comprobado y método «merge» (nunca push a main)", async () => {
    const calls = stub({ "/pulls/7/merge": { merged: true } });
    await createGitHubClient("tok").mergePullRequest("criterio", 7, "abc123");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.github.com/repos/trove-empresas/criterio/pulls/7/merge");
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({ sha: "abc123", merge_method: "merge" });
  });
});
