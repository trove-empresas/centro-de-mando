import type { InlineButton } from "./env";

export type PrAction = "approve" | "changes" | "reject";

const CODE: Record<PrAction, string> = { approve: "a", changes: "c", reject: "r" };
const FROM_CODE: Record<string, PrAction> = { a: "approve", c: "changes", r: "reject" };

/** Los tres botones de una PR; `data` lleva acción, repo (nombre corto) y número. */
export function prButtons(repo: string, number: number): InlineButton[] {
  return [
    { text: "✅ Aprobar", data: `pr:${CODE.approve}:${repo}:${number}` },
    { text: "✏️ Pedir cambios", data: `pr:${CODE.changes}:${repo}:${number}` },
    { text: "❌ Rechazar", data: `pr:${CODE.reject}:${repo}:${number}` },
  ];
}

/** Interpreta el `data` de una pulsación; null si no tiene el formato esperado. */
export function parsePrButton(data: string): { action: PrAction; repo: string; number: number } | null {
  const m = /^pr:([acr]):([A-Za-z0-9._-]+):(\d{1,9})$/.exec(data);
  if (!m) return null;
  const action = FROM_CODE[m[1]!];
  return action ? { action, repo: m[2]!, number: Number(m[3]) } : null;
}
