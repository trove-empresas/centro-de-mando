import type { GitHubClient } from "./env";

export interface IssueCommandResult {
  reply: string;
}

/** ¿El texto es el comando /issue? (también «/issue@NombreDelBot»). */
export function isIssueCommand(text: string): boolean {
  return /^\/issue(@\w+)?(\s|$)/.test(text);
}

const HELP = (repos: string[]) =>
  `Para crear una instrucción: /issue <repo> <texto>\n` +
  `La primera línea es el título; el resto, la descripción.\n` +
  `Repos: ${repos.join(", ")}`;

/**
 * Formato: `/issue <repo> <texto>`. Primera línea = título, resto = descripción.
 * Solo crea issues en repos de la lista permitida.
 */
export async function handleIssueCommand(
  text: string,
  repos: string[],
  github: GitHubClient | undefined,
): Promise<IssueCommandResult> {
  const rest = text.replace(/^\/issue(@\w+)?/, "").trim();
  if (rest === "") return { reply: HELP(repos) };

  const match = /^(\S+)\s+([\s\S]+)$/.exec(rest);
  if (!match) return { reply: HELP(repos) };
  const [, repoArg, content] = match as unknown as [string, string, string];

  const repo = repos.find((r) => r.toLowerCase() === repoArg.toLowerCase());
  if (!repo) return { reply: `El repo «${repoArg}» no está en la lista.\n${HELP(repos)}` };

  if (!github) return { reply: "GitHub no está configurado todavía (falta el token)." };

  const lines = content.trim().split("\n");
  const title = (lines[0] ?? "").trim().slice(0, 200);
  const body = lines.slice(1).join("\n").trim();
  try {
    const issue = await github.createIssue(repo, title, body);
    return { reply: `Creada ${repo}#${issue.number}: ${issue.url}` };
  } catch {
    return { reply: "No he podido crear la issue (GitHub ha dado error). No se ha creado nada." };
  }
}
