# Registro de decisiones

Aquí se apuntan las decisiones relevantes del proyecto (técnicas, de
producto o de cualquier otro tipo), de la más reciente a la más antigua. Una
decisión no se borra: si cambia, se añade una nueva que la sustituye y se
indica en ambas.

## Formato

```markdown
## AAAA-MM-DD — Título corto de la decisión

- **Decisión:** qué se ha decidido, en una o dos frases.
- **Motivo:** por qué.
- **Alternativas descartadas:**
  - Alternativa A: por qué no.
  - Alternativa B: por qué no.
- **Estado:** vigente | sustituida por «AAAA-MM-DD — …»
```

## Decisiones

## 2026-10-05 — Despliegue automático a Cloudflare, también con fusión automática

- **Decisión:** el workflow `.github/workflows/desplegar.yml` publica el
  Worker con `wrangler deploy` en cada push a `main`, a mano
  (`workflow_dispatch`) y en una **revisión cada hora** (`schedule`) que
  despliega solo si el último commit de `main` aún no tiene un despliegue
  correcto. Antes de publicar vuelve a pasar pruebas, tipos y lint. Sin los
  secretos de Cloudflare se salta sin fallar.
- **Motivo:** las fusiones hechas con `GITHUB_TOKEN` (fusión automática de
  `criterio/procedimientos/fusion-automatica.md`) no disparan otros
  workflows, ni `push` ni `pull_request: closed`. La revisión programada sí
  se lanza siempre y no necesita credenciales nuevas. Cada hora (y no cada
  15 minutos) porque el repo es privado y cada ejecución consume minutos de
  Actions: unas 24 al día en la comprobación, que casi nunca despliega.
- **Alternativas descartadas:**
  - Que la fusión automática use un token personal o una GitHub App en vez
    de `GITHUB_TOKEN`: sí dispararía `push`, pero añade otra credencial con
    permiso de escritura y cambia el mecanismo común de `criterio`.
  - Lanzar el despliegue desde el workflow de fusión automática
    (`workflow_dispatch`): ese workflow solo *activa* la fusión; la fusión
    real ocurre después, cuando pasan las comprobaciones, y no hay ningún
    evento que la siga.
  - `workflow_run` tras la CI: la CI de la PR termina antes de la fusión, y
    la de `main` tampoco se lanza con `GITHUB_TOKEN`.
  - Entornos de GitHub (`environment:`) para registrar despliegues: crean
    un ajuste en el repositorio, que solo gestiona Gonzalo.
- **Estado:** vigente

## 2026-10-05 — Alojamiento, lenguaje y alcance del centro de mando v1

- **Decisión:** Cloudflare Workers con TypeScript. «Aprobar» en una PR la
  fusiona tras una segunda confirmación y solo si las comprobaciones
  obligatorias están en verde. Repositorios gestionados: `criterio`,
  `contabilidad-autonomo` y `centro-de-mando`, en una lista configurable;
  ningún otro. Credencial de GitHub: token de grano fino limitado a esos
  repos, con permisos mínimos y caducidad. El Worker verifica el secreto del
  webhook de Telegram y la firma del webhook de GitHub.
- **Motivo:** sin servidor que mantener, coste previsto ~0 €/mes, encaja con
  pocos mensajes al día. Coste pendiente de verificar en la página oficial.
- **Alternativas descartadas:**
  - VPS (~4–6 €/mes): hay que mantener el sistema.
  - GitHub Actions: no responde a Telegram al instante.
  - Fly.io / Railway / Render: plan gratuito menos estable o pide tarjeta.
  - GitHub App en vez de token de grano fino: Gonzalo eligió el token.
- **Estado:** vigente
