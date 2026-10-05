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
valores reales nunca entran en el repositorio. No hay despliegue configurado
todavía (issue #13).
