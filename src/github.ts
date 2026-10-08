import type { GitHubClient } from "./env";
import type { PrMergeStatus } from "./merge";
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

  /** GET con JSON; sin token ni contenido en el error. */
  async function getJson<T>(path: string, what: string): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "centro-de-mando" },
    });
    if (!res.ok) throw new Error(`GitHub ${what} falló: ${res.status}`);
    return (await res.json()) as T;
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
    async getPullRequestMergeStatus(repo, number) {
      const base = `/repos/${GITHUB_OWNER}/${repo}`;
      const pr = await getJson<{
        state: string;
        merged: boolean;
        draft: boolean;
        mergeable: boolean | null;
        base: { ref: string };
        head: { sha: string };
      }>(`${base}/pulls/${number}`, "getPullRequest");
      const sha = pr.head.sha;
      const runs = await getJson<{
        total_count: number;
        check_runs: { name: string; status: string; conclusion: string | null }[];
      }>(`${base}/commits/${sha}/check-runs?per_page=100`, "getCheckRuns");
      const statuses = await getJson<{ statuses: { context: string; state: string }[] }>(
        `${base}/commits/${sha}/status?per_page=100`,
        "getCommitStatus",
      );
      const checks: PrMergeStatus["checks"] = [
        ...runs.check_runs.map((r) => ({
          name: r.name,
          result:
            r.status !== "completed"
              ? ("pending" as const)
              : ["success", "neutral", "skipped"].includes(r.conclusion ?? "")
                ? ("success" as const)
                : ("failure" as const),
        })),
        ...statuses.statuses.map((s) => ({
          name: s.context,
          result: s.state === "success" ? ("success" as const) : s.state === "pending" ? ("pending" as const) : ("failure" as const),
        })),
      ];
      return {
        state: pr.state === "open" ? "open" : "closed",
        merged: pr.merged,
        draft: pr.draft,
        base: pr.base.ref,
        headSha: sha,
        mergeable: pr.mergeable,
        checks,
        checksTruncated: runs.total_count > runs.check_runs.length,
      };
    },
    async mergePullRequest(repo, number, sha) {
      await send("PUT", `/repos/${GITHUB_OWNER}/${repo}/pulls/${number}/merge`, { sha, merge_method: "merge" }, "mergePullRequest");
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
