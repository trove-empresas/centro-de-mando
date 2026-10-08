import type { InlineButton } from "./env";

export type PrAction = "approve" | "changes" | "reject" | "confirm" | "cancel";

const CODE: Record<PrAction, string> = { approve: "a", changes: "c", reject: "r", confirm: "m", cancel: "n" };
const FROM_CODE: Record<string, PrAction> = { a: "approve", c: "changes", r: "reject", m: "confirm", n: "cancel" };

/** Los tres botones de una PR; `data` lleva acción, repo (nombre corto) y número. */
export function prButtons(repo: string, number: number): InlineButton[] {
  return [
    { text: "✅ Aprobar", data: `pr:${CODE.approve}:${repo}:${number}` },
    { text: "✏️ Pedir cambios", data: `pr:${CODE.changes}:${repo}:${number}` },
    { text: "❌ Rechazar", data: `pr:${CODE.reject}:${repo}:${number}` },
  ];
}

/** Segunda confirmación de «Aprobar»: solo «Sí, fusionar» fusiona. */
export function mergeConfirmButtons(repo: string, number: number): InlineButton[] {
  return [
    { text: "✅ Sí, fusionar", data: `pr:${CODE.confirm}:${repo}:${number}` },
    { text: "Cancelar", data: `pr:${CODE.cancel}:${repo}:${number}` },
  ];
}

/** Interpreta el `data` de una pulsación; null si no tiene el formato esperado. */
export function parsePrButton(data: string): { action: PrAction; repo: string; number: number } | null {
  const m = /^pr:([acrmn]):([A-Za-z0-9._-]+):(\d{1,9})$/.exec(data);
  if (!m) return null;
  const action = FROM_CODE[m[1]!];
  return action ? { action, repo: m[2]!, number: Number(m[3]) } : null;
}

const PROMPT_RE = /^Escribe en respuesta a este mensaje el comentario para la PR ([A-Za-z0-9._-]+)#(\d{1,9})\b/;

/** Texto con el que el bot pide el comentario; de él se recupera la PR al llegar la respuesta (sin guardar estado). */
export function changesPrompt(repo: string, number: number): string {
  return `Escribe en respuesta a este mensaje el comentario para la PR ${repo}#${number} (se publicará en la PR y se pondrá la etiqueta «corregir»).`;
}

/** PR a la que se refiere una respuesta a `changesPrompt`; null si no lo es. */
export function parseChangesPrompt(text: string): { repo: string; number: number } | null {
  const m = PROMPT_RE.exec(text);
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
}
