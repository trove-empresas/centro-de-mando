import type { GitHubClient } from "./env";
import { GITHUB_OWNER } from "./repos";

export function createGitHubClient(token: string): GitHubClient {
  return {
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
