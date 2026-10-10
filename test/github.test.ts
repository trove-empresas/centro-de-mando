import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "../src/github";

// Datos inventados.
const issue = (n: number) => ({ number: n, title: `T${n}`, html_url: `https://ejemplo.test/${n}`, labels: [] });
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => issue(from + i));

afterEach(() => vi.unstubAllGlobals());

describe("listOpenItems pagina", () => {
  it("pide páginas hasta que una viene incompleta (más de 100 abiertas)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const p = Number(new URL(url).searchParams.get("page") ?? "1");
        const body = p === 1 ? page(1, 100) : p === 2 ? page(101, 100) : page(201, 30);
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const items = await createGitHubClient("tok").listOpenItems("repo-a");
    expect(items).toHaveLength(230);
    expect(items[229]?.number).toBe(230);
    expect(urls.map((u) => new URL(u).searchParams.get("page"))).toEqual(["1", "2", "3"]);
  });

  it("con una sola página incompleta hace una sola petición", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(page(1, 5)), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await createGitHubClient("tok").listOpenItems("repo-a")).toHaveLength(5);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("si una página falla, falla (no devuelve datos a medias)", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++n === 1 ? new Response(JSON.stringify(page(1, 100)), { status: 200 }) : new Response("x", { status: 500 }))),
    );
    await expect(createGitHubClient("tok").listOpenItems("repo-a")).rejects.toThrow("500");
  });

  it("si supera el tope de páginas falla en vez de truncar en silencio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(page(1, 100)), { status: 200 })));
    await expect(createGitHubClient("tok").listOpenItems("repo-a")).rejects.toThrow(/demasiadas/);
  });
});
