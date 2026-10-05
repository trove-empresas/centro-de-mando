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
