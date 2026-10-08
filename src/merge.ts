/** Estado de una PR tal como lo necesita la decisión de fusionar (lo rellena el cliente de GitHub). */
export interface PrMergeStatus {
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  /** Rama a la que va la PR. */
  base: string;
  /** Último commit de la PR: la fusión se pide sobre ese mismo commit. */
  headSha: string;
  /** null = GitHub aún lo está calculando. */
  mergeable: boolean | null;
  /** Comprobaciones (check runs) y estados (commit statuses) del último commit. */
  checks: { name: string; result: "success" | "pending" | "failure" }[];
  /** true si había más comprobaciones de las que se pudieron leer. */
  checksTruncated: boolean;
}

export type MergeDecision = { ok: true } | { ok: false; reason: string };

export const MERGE_BASE = "main";

/**
 * ¿Se puede fusionar? Falla cerrado: ante cualquier duda (sin comprobaciones, pendientes,
 * en rojo, cálculo sin terminar) devuelve el motivo en lenguaje llano y no se fusiona.
 */
export function canMerge(s: PrMergeStatus): MergeDecision {
  if (s.merged) return { ok: false, reason: "La PR ya está fusionada." };
  if (s.state !== "open") return { ok: false, reason: "La PR está cerrada." };
  if (s.draft) return { ok: false, reason: "La PR es un borrador." };
  if (s.base !== MERGE_BASE) return { ok: false, reason: `La PR no va a ${MERGE_BASE}, sino a ${s.base}.` };
  if (s.mergeable === false) return { ok: false, reason: "La PR tiene conflictos con main." };
  if (s.mergeable === null) return { ok: false, reason: "GitHub aún está calculando si se puede fusionar. Inténtalo en un minuto." };
  if (s.checksTruncated) return { ok: false, reason: "Tiene demasiadas comprobaciones para leerlas todas." };
  if (s.checks.length === 0) {
    return { ok: false, reason: "No hay comprobaciones en el último commit: no puedo confirmar que estén en verde." };
  }
  const failed = s.checks.filter((c) => c.result === "failure").map((c) => c.name);
  if (failed.length > 0) return { ok: false, reason: `Comprobaciones en rojo: ${failed.join(", ")}.` };
  const pending = s.checks.filter((c) => c.result === "pending").map((c) => c.name);
  if (pending.length > 0) return { ok: false, reason: `Comprobaciones aún en curso: ${pending.join(", ")}.` };
  return { ok: true };
}
