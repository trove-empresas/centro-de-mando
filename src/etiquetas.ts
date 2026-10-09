import type { GitHubClient } from "./env";

/** Etiquetas que los agentes y el bot necesitan en cada repo (un agente no puede crearlas). */
export const REQUIRED_LABELS = [
  { name: "necesita-gonzalo", color: "d93f0b", description: "Espera una respuesta o decisión de Gonzalo" },
  { name: "corregir", color: "fbca04", description: "PR con cambios pedidos por Gonzalo" },
];

/** ¿El texto es el comando /etiquetas? (también «/etiquetas@NombreDelBot»). */
export function isEtiquetasCommand(text: string): boolean {
  return /^\/etiquetas(@\w+)?(\s|$)/.test(text);
}

/**
 * Crea en cada repo de la lista las etiquetas que falten. Se puede repetir sin
 * problema: las que ya existen no se tocan. Solo actúa sobre `repos` (la lista
 * permitida); si GitHub falla en un repo, lo dice tal cual y sigue con el resto.
 */
export async function handleEtiquetasCommand(
  repos: string[],
  github: GitHubClient | undefined,
): Promise<{ reply: string }> {
  if (!github) return { reply: "GitHub no está configurado todavía (falta el token). No he hecho nada." };
  const lines: string[] = [];
  for (const repo of repos) {
    const created: string[] = [];
    const existing: string[] = [];
    let failed: string | undefined;
    for (const label of REQUIRED_LABELS) {
      try {
        const isNew = await github.createLabel(repo, label.name, label.color, label.description);
        (isNew ? created : existing).push(label.name);
      } catch {
        failed = label.name;
        break;
      }
    }
    if (failed !== undefined) {
      lines.push(`${repo}: no he podido crear «${failed}» (GitHub ha dado error). Revisa los permisos del token o créala a mano.`);
    } else if (created.length === 0) {
      lines.push(`${repo}: ya tenía todas las etiquetas.`);
    } else {
      lines.push(`${repo}: creadas ${created.map((n) => `«${n}»`).join(", ")}${existing.length > 0 ? `; ya existían ${existing.map((n) => `«${n}»`).join(", ")}` : ""}.`);
    }
  }
  return { reply: lines.join("\n") };
}
