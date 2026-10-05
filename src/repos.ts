export const GITHUB_OWNER = "trove-empresas";

/** Lista por defecto; se cambia con GITHUB_ALLOWED_REPOS sin tocar código. */
const DEFAULT_REPOS = ["criterio", "contabilidad-autonomo", "centro-de-mando"];

/** Nombres cortos de los repos permitidos (todos del dueño GITHUB_OWNER). */
export function allowedRepos(config: string | undefined): string[] {
  if (!config) return DEFAULT_REPOS;
  const list = config
    .split(",")
    .map((r) => r.trim().replace(`${GITHUB_OWNER}/`, ""))
    .filter((r) => r !== "");
  return list.length > 0 ? list : DEFAULT_REPOS;
}
