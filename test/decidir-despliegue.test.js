// Pruebas del script que decide si el workflow «Desplegar» publica el bot.
// Se sustituye la herramienta `gh` por una simulación que devuelve
// ejecuciones inventadas; las expresiones --jq se evalúan con jq de verdad.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "..", ".github", "scripts", "decidir-despliegue.sh");
const SHA = "abc123";

// `gh api <ruta> --jq <expr>`: responde según la ruta con los datos inventados.
const GH_FALSO = `#!/usr/bin/env bash
ruta="$2"; expr="$4"
echo "$ruta" >> "$DIR/llamadas"
case "$ruta" in
  */actions/workflows/desplegar.yml/runs*) cat "$DIR/runs.json" | jq -r "$expr" ;;
  */actions/runs/*/jobs*) id=$(echo "$ruta" | sed -E 's#.*/runs/([0-9]+)/jobs.*#\\1#'); cat "$DIR/jobs-$id.json" | jq -r "$expr" ;;
  *) echo "ruta inesperada: $ruta" >&2; exit 1 ;;
esac
`;

function ejecutar({ evento, credenciales = "true", runs = [], jobs = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "decidir-"));
  writeFileSync(join(dir, "gh"), GH_FALSO);
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(join(dir, "runs.json"), JSON.stringify({ workflow_runs: runs.map((id) => ({ id })) }));
  for (const [id, lista] of Object.entries(jobs)) {
    writeFileSync(join(dir, `jobs-${id}.json`), JSON.stringify({ jobs: lista }));
  }
  writeFileSync(join(dir, "llamadas"), "");
  const salida = join(dir, "salida");
  writeFileSync(salida, "");
  const log = execFileSync("bash", [SCRIPT], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      DIR: dir,
      EVENTO: evento,
      SHA,
      REPO: "trove-empresas/centro-de-mando",
      TIENE_CREDENCIALES: credenciales,
      GITHUB_OUTPUT: salida,
    },
    encoding: "utf8",
  });
  return {
    salida: readFileSync(salida, "utf8").trim(),
    llamadas: readFileSync(join(dir, "llamadas"), "utf8").trim(),
    log,
  };
}

const despliegueCorrecto = { name: "Desplegar en Cloudflare", conclusion: "success" };
const despliegueSaltado = { name: "Desplegar en Cloudflare", conclusion: "skipped" };
const decision = { name: "Decidir si hay que desplegar", conclusion: "success" };

describe("decidir-despliegue.sh", () => {
  it("no despliega ni consulta nada si faltan las credenciales de Cloudflare", () => {
    for (const evento of ["push", "schedule", "workflow_dispatch"]) {
      const r = ejecutar({ evento, credenciales: "false" });
      expect(r.salida).toBe("desplegar=false");
      expect(r.llamadas).toBe("");
      expect(r.log).toContain("faltan los secretos");
    }
  });

  it("despliega siempre en push a main y al lanzarlo a mano", () => {
    for (const evento of ["push", "workflow_dispatch"]) {
      const r = ejecutar({ evento });
      expect(r.salida).toBe("desplegar=true");
      expect(r.llamadas).toBe("");
    }
  });

  it("en la revisión programada despliega si el commit nunca se desplegó (fusión con GITHUB_TOKEN)", () => {
    const r = ejecutar({ evento: "schedule" });
    expect(r.salida).toBe("desplegar=true");
    expect(r.llamadas).toContain(`head_sha=${SHA}`);
  });

  it("en la revisión programada no repite si ya hay un despliegue correcto de ese commit", () => {
    const r = ejecutar({ evento: "schedule", runs: [7, 8], jobs: { 7: [decision, despliegueSaltado], 8: [decision, despliegueCorrecto] } });
    expect(r.salida).toBe("desplegar=false");
    expect(r.log).toContain("ejecución 8");
  });

  it("cuenta como no desplegado un commit cuyas ejecuciones se saltaron el despliegue (p. ej. sin credenciales)", () => {
    const r = ejecutar({ evento: "schedule", runs: [7], jobs: { 7: [decision, despliegueSaltado] } });
    expect(r.salida).toBe("desplegar=true");
  });

  it("el nombre del trabajo coincide con el del workflow", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "desplegar.yml"), "utf8");
    expect(workflow).toContain(`name: ${despliegueCorrecto.name}\n`);
  });
});
