import type { GitHubClient } from "./env";
import { GITHUB_OWNER } from "./repos";

const API = "https://api.github.com";

export function createGitHubClient(token: string): GitHubClient {
  /** Llamada con cuerpo JSON; sin contenido ni token en el error. */
  async function send(method: string, path: string, payload: unknown, what: string): Promise<void> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "centro-de-mando",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`GitHub ${what} falló: ${res.status}`);
  }

  return {
    async addComment(repo, number, body) {
      await send("POST", `/repos/${GITHUB_OWNER}/${repo}/issues/${number}/comments`, { body }, "addComment");
    },
    async addLabel(repo, number, label) {
      await send("POST", `/repos/${GITHUB_OWNER}/${repo}/issues/${number}/labels`, { labels: [label] }, "addLabel");
    },
    async closePullRequest(repo, number) {
      await send("PATCH", `/repos/${GITHUB_OWNER}/${repo}/pulls/${number}`, { state: "closed" }, "closePullRequest");
    },
    async listOpenItems(repo) {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues?state=open&per_page=100`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "user-agent": "centro-de-mando",
          },
        },
      );
      if (!res.ok) throw new Error(`GitHub listOpenItems falló: ${res.status}`);
      const data = (await res.json()) as {
        number: number;
        title: string;
        html_url: string;
        pull_request?: unknown;
        labels: ({ name?: string } | string)[];
      }[];
      return data.map((i) => ({
        number: i.number,
        title: i.title,
        url: i.html_url,
        isPr: i.pull_request !== undefined,
        labels: i.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter((l) => l !== ""),
      }));
    },
    async createIssue(repo, title, body) {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "user-agent": "centro-de-mando",
        },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        // Sin contenido de la issue ni del token en el registro.
        throw new Error(`GitHub createIssue falló: ${res.status}`);
      }
      const data = (await res.json()) as { number: number; html_url: string };
      return { number: data.number, url: data.html_url };
    },
  };
}
