import type { GitHubClient, OpenItem } from "./env";

/** ¿El texto es el comando /estado? (también «/estado@NombreDelBot»). */
export function isEstadoCommand(text: string): boolean {
  return /^\/estado(@\w+)?(\s|$)/.test(text);
}

const HIGHLIGHT = ["necesita-gonzalo", "corregir"];

function line(item: OpenItem): string {
  const marks = item.labels.filter((l) => HIGHLIGHT.includes(l));
  const flag = marks.length > 0 ? ` ⚠ ${marks.join(", ")}` : "";
  return `- ${item.isPr ? "PR" : "Issue"} #${item.number}: ${item.title}${flag}\n  ${item.url}`;
}

/**
 * Responde con las issues y PR abiertas de cada repo de la lista.
 * Si GitHub falla para un repo, lo dice tal cual; nunca se inventan datos.
 */
export async function handleEstadoCommand(
  repos: string[],
  github: GitHubClient | undefined,
): Promise<{ reply: string }> {
  if (!github) return { reply: "GitHub no está configurado todavía (falta el token)." };
  const blocks: string[] = [];
  for (const repo of repos) {
    try {
      const items = await github.listOpenItems(repo);
      if (items.length === 0) {
        blocks.push(`${repo}: nada abierto.`);
        continue;
      }
      // Primero lo que espera a Gonzalo.
      const sorted = [...items].sort(
        (a, b) => Number(b.labels.some((l) => HIGHLIGHT.includes(l))) - Number(a.labels.some((l) => HIGHLIGHT.includes(l))),
      );
      blocks.push(`${repo} (${items.length} abiertas):\n${sorted.map(line).join("\n")}`);
    } catch {
      blocks.push(`${repo}: no he podido consultar GitHub (ha dado error). No tengo datos de este repo.`);
    }
  }
  return { reply: blocks.join("\n\n") };
}
