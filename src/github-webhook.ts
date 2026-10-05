import type { Env, TelegramClient } from "./env";
import { prButtons } from "./pr-buttons";
import { GITHUB_OWNER, allowedRepos } from "./repos";

const SIGNATURE_HEADER = "x-hub-signature-256";
const NEEDS_LABEL = "necesita-gonzalo";

interface PullRequestEvent {
  action?: string;
  pull_request?: { number?: number; title?: string; html_url?: string; draft?: boolean };
  repository?: { full_name?: string };
}

interface IssuesEvent {
  action?: string;
  label?: { name?: string };
  issue?: { number?: number; title?: string; html_url?: string };
  repository?: { full_name?: string };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^([0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Verifica la firma HMAC SHA-256 del cuerpo sin leerlo como JSON. `verify` compara en tiempo constante. */
async function validSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (header === null || !header.startsWith("sha256=")) return false;
  const sig = hexToBytes(header.slice("sha256=".length));
  if (sig === null) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(rawBody));
}

/**
 * Avisos (webhooks) de GitHub. Firma verificada ANTES de interpretar el contenido.
 * Solo avisa de issues etiquetadas con «necesita-gonzalo» en repos de la lista.
 * No registra contenido de mensajes ni secretos.
 */
export async function handleGitHubWebhook(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Sin configuración completa no se procesa nada (fallar cerrado).
  if (!env.GITHUB_WEBHOOK_SECRET || !env.TELEGRAM_ALLOWED_USER_ID) {
    return new Response("Not configured", { status: 500 });
  }

  const rawBody = await request.text();
  if (!(await validSignature(rawBody, request.headers.get(SIGNATURE_HEADER), env.GITHUB_WEBHOOK_SECRET))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  if (eventName !== "issues" && eventName !== "pull_request") return new Response(null, { status: 200 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (eventName === "pull_request") return notifyNewPr(parsed as PullRequestEvent, env, telegram);
  const event = parsed as IssuesEvent;

  if (event.action !== "labeled" || event.label?.name !== NEEDS_LABEL) return new Response(null, { status: 200 });

  const fullName = event.repository?.full_name ?? "";
  const repo = allowedRepos(env.GITHUB_ALLOWED_REPOS).find(
    (r) => `${GITHUB_OWNER}/${r}`.toLowerCase() === fullName.toLowerCase(),
  );
  const { number, title, html_url: url } = event.issue ?? {};
  if (!repo || number === undefined || !url) return new Response(null, { status: 200 });

  // El chat privado de Gonzalo con el bot tiene como id su propio id de usuario.
  await telegram.sendMessage(
    Number(env.TELEGRAM_ALLOWED_USER_ID),
    `Necesito que mires esto (${NEEDS_LABEL}): ${repo}#${number}${title ? ` — ${title}` : ""}\n${url}`,
  );
  return new Response(null, { status: 200 });
}

/** PR abierta en un repo de la lista: mensaje a Gonzalo con los tres botones. */
async function notifyNewPr(event: PullRequestEvent, env: Env, telegram: TelegramClient): Promise<Response> {
  if (event.action !== "opened") return new Response(null, { status: 200 });
  const fullName = event.repository?.full_name ?? "";
  const repo = allowedRepos(env.GITHUB_ALLOWED_REPOS).find(
    (r) => `${GITHUB_OWNER}/${r}`.toLowerCase() === fullName.toLowerCase(),
  );
  const { number, title, html_url: url } = event.pull_request ?? {};
  if (!repo || number === undefined || !url) return new Response(null, { status: 200 });

  await telegram.sendMessage(
    Number(env.TELEGRAM_ALLOWED_USER_ID),
    `PR nueva: ${repo}#${number}${title ? ` — ${title}` : ""}\n${url}`,
    prButtons(repo, number),
  );
  return new Response(null, { status: 200 });
}
