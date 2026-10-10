import type { GitHubClient, OpenItem } from "./env";

/** ¿El texto es el comando /estado? (también «/estado@NombreDelBot»). */
export function isEstadoCommand(text: string): boolean {
  return /^\/estado(@\w+)?(\s|$)/.test(text);
}

/** Telegram rechaza mensajes de más de 4096 caracteres. */
export const TELEGRAM_LIMIT = 4096;

/**
 * Reparte las entradas en mensajes de como máximo `limit` caracteres, sin
 * partir una entrada por la mitad (salvo que una sola ya no quepa).
 */
export function splitMessages(entries: string[], limit = TELEGRAM_LIMIT): string[] {
  const parts: string[] = [];
  let current = "";
  const flush = () => {
    if (current !== "") parts.push(current);
    current = "";
  };
  for (const entry of entries) {
    if (current !== "" && current.length + 1 + entry.length <= limit) {
      current += `\n${entry}`;
      continue;
    }
    flush();
    let rest = entry.replace(/^\n/, ""); // un mensaje nuevo no empieza con línea en blanco
    while (rest.length > limit) {
      parts.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    current = rest;
  }
  flush();
  return parts;
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
): Promise<{ reply: string; parts: string[] }> {
  if (!github) {
    const reply = "GitHub no está configurado todavía (falta el token).";
    return { reply, parts: [reply] };
  }
  // Cada elemento es una entrada indivisible; el bloque de un repo empieza tras una línea en blanco.
  const entries: string[] = [];
  const addBlock = (...lines: string[]) => {
    const [first = "", ...rest] = lines;
    entries.push(entries.length > 0 ? `\n${first}` : first, ...rest);
  };
  for (const repo of repos) {
    try {
      const items = await github.listOpenItems(repo);
      if (items.length === 0) {
        addBlock(`${repo}: nada abierto.`);
        continue;
      }
      // Primero lo que espera a Gonzalo.
      const sorted = [...items].sort(
        (a, b) => Number(b.labels.some((l) => HIGHLIGHT.includes(l))) - Number(a.labels.some((l) => HIGHLIGHT.includes(l))),
      );
      addBlock(`${repo} (${items.length} abiertas):`, ...sorted.map(line));
    } catch {
      addBlock(`${repo}: no he podido consultar GitHub (ha dado error). No tengo datos de este repo.`);
    }
  }
  return { reply: entries.join("\n"), parts: splitMessages(entries) };
}
