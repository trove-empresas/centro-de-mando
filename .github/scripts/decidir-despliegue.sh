#!/usr/bin/env bash
# Decide si el workflow «Desplegar» debe publicar el Worker en Cloudflare.
#
# Entradas (variables de entorno):
#   EVENTO              evento que lanzó el workflow (push, workflow_dispatch, schedule)
#   SHA                 commit que se desplegaría
#   REPO                «dueño/repo»
#   TIENE_CREDENCIALES  "true" si existen CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID
#   GITHUB_OUTPUT       archivo donde se escribe «desplegar=true|false»
#   GH_TOKEN            token de solo lectura para consultar ejecuciones anteriores
#
# La revisión programada (schedule) existe porque lo que fusiona GitHub con su
# token interno (GITHUB_TOKEN, p. ej. la fusión automática) no dispara el
# evento push: cada hora se comprueba si el último commit de main ya está
# desplegado y, si no, se despliega.
set -euo pipefail

# Nombre del trabajo de despliegue en .github/workflows/desplegar.yml.
TRABAJO_DESPLIEGUE="Desplegar en Cloudflare"

decidir() {
  echo "desplegar=$1" >> "$GITHUB_OUTPUT"
  echo "$2"
}

if [[ "${TIENE_CREDENCIALES:-}" != "true" ]]; then
  decidir false "::notice::No se despliega: faltan los secretos CLOUDFLARE_API_TOKEN o CLOUDFLARE_ACCOUNT_ID (ver docs/guia-publicacion.md, paso 2)."
  exit 0
fi

if [[ "${EVENTO:-}" != "schedule" ]]; then
  decidir true "Se despliega ${SHA} (evento: ${EVENTO})."
  exit 0
fi

# Revisión programada: ¿hay alguna ejecución anterior en la que el trabajo de
# despliegue terminara bien para este mismo commit?
ejecuciones=$(gh api "repos/${REPO}/actions/workflows/desplegar.yml/runs?head_sha=${SHA}&status=success&per_page=100" \
  --jq '.workflow_runs[].id')
for id in $ejecuciones; do
  correctos=$(gh api "repos/${REPO}/actions/runs/${id}/jobs?per_page=100" \
    --jq "[.jobs[] | select(.name == \"${TRABAJO_DESPLIEGUE}\" and .conclusion == \"success\")] | length")
  if [[ "$correctos" != "0" ]]; then
    decidir false "${SHA} ya está desplegado (ejecución ${id}); no hay nada que hacer."
    exit 0
  fi
done

decidir true "::notice::${SHA} no estaba desplegado (probablemente lo fusionó GitHub con su token interno, que no dispara push). Se despliega ahora."
