# centro-de-mando

Bot de Telegram que hace de puente con GitHub. Arquitectura en
`docs/arquitectura.md`.

## Desarrollo

```
npm install
npm test          # pruebas automáticas
npm run typecheck # comprobación de tipos
npm run lint
```

Las variables necesarias están (solo sus nombres) en `.env.example`. Los
valores reales nunca entran en el repositorio.

## Despliegue

`wrangler.toml` configura el Worker y `.github/workflows/desplegar.yml` lo
publica en Cloudflare con lo que hay en `main` (detalle y motivo en
`docs/decisiones.md`; pasos para Gonzalo en `docs/guia-publicacion.md`).
`npx wrangler deploy --dry-run` comprueba que compila sin publicar nada.
