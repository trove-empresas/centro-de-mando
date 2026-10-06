import type { GitHubClient } from "./env";
import { GITHUB_OWNER } from "./repos";

export function createGitHubClient(token: string): GitHubClient {
  return {
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
