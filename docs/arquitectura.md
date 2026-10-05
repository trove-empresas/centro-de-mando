# Arquitectura propuesta — centro-de-mando v1

> Estado: **propuesta**, pendiente de que Gonzalo la apruebe. No hay código.
> Los precios de abajo son estimaciones de memoria **no verificadas** contra
> las páginas oficiales (desde este entorno no he comprobado nada): hay que
> confirmarlos antes de contratar.

## 1. Qué hay que construir

Un «bot» (programa que contesta en Telegram) que hace de puente entre
Telegram y GitHub:

| Función v1 | Cómo se resuelve |
|---|---|
| 1. Crear issue desde un mensaje | Telegram → bot → API de GitHub (crear issue) |
| 2. Aviso de PR nueva con botones | GitHub avisa al bot (webhook) → mensaje con botones |
| 3. Aviso de `necesita-gonzalo` | Webhook de GitHub, evento «issue etiquetada» |
| 4. `/estado` | El bot consulta la API de GitHub (issues y PR abiertas por repo) |

«Webhook» = GitHub llama a una dirección web nuestra cada vez que pasa algo,
así no hay que estar preguntando continuamente.

## 2. Dónde se aloja (recomendación)

**Cloudflare Workers** (código que se ejecuta solo cuando llega un aviso; no
hay servidor que mantener).

- Telegram y GitHub necesitan una dirección web pública a la que avisar:
  Workers la da gratis y con HTTPS.
- Encaja con el uso real: pocos mensajes al día.
- Los secretos se guardan en el almacén de secretos del propio Workers, fuera
  del código.
- Coste estimado: **0 €/mes** dentro del plan gratuito (límite del orden de
  100.000 peticiones al día; usaremos unas decenas). Telegram Bot API y
  GitHub API son gratuitas para este uso.

Alternativas descartadas:

- **Servidor pequeño (VPS, ~4–6 €/mes):** más flexible, pero hay que
  mantener el sistema, actualizaciones y seguridad. Sobra para esto.
- **GitHub Actions como alojamiento:** no puede recibir mensajes de Telegram
  al instante; solo se podría consultar cada pocos minutos. Peor experiencia.
- **Fly.io / Railway / Render:** valen, pero el plan gratuito es menos
  estable o pide tarjeta; Workers es más simple para este tamaño.

Pendiente de comprobar: que el lenguaje elegido (JavaScript/TypeScript, el
nativo de Workers) te parece bien; es una decisión nueva a registrar en
`docs/decisiones.md` cuando la apruebes. Python en Workers existe pero es más
limitado.

## 3. Credenciales necesarias (las creas tú)

| Credencial | Para qué | Cómo se obtiene | Permisos mínimos |
|---|---|---|---|
| Token del bot de Telegram | Que el bot envíe y reciba | Hablar con @BotFather en Telegram | — |
| Tu ID numérico de Telegram | Que solo te responda a ti | Un bot tipo @userinfobot o el primer mensaje | No es secreto, pero va en configuración, no en el código |
| Secreto del webhook de Telegram | Comprobar que los mensajes vienen de Telegram | Una cadena aleatoria que se inventa | — |
| Credencial de GitHub | Crear issues, etiquetar, comentar, cerrar/fusionar PR | **GitHub App** instalada solo en tus repos (preferida) o token «fine-grained» | Issues: lectura/escritura; Pull requests: lectura/escritura; Metadata: lectura. **Sin** acceso a contenido ni a ajustes |
| Secreto del webhook de GitHub | Comprobar que los avisos vienen de GitHub | Cadena aleatoria | — |

### Cómo se guardan

- Solo en el almacén de secretos de Cloudflare (`wrangler secret put`), nunca
  en el repositorio, ni en ejemplos, ni en el historial (línea roja).
- El repo tendrá un `.env.example` solo con los **nombres** de las variables.
- El token de GitHub no podrá tocar ajustes del repositorio ni la protección
  de ramas (línea roja), por no pedir ese permiso.
- Si un secreto se filtra: se revoca en su origen (BotFather / GitHub) y se
  crea otro; no hay que tocar código.

## 4. Seguridad

- **Solo tu usuario:** el bot comprueba el ID de Telegram en cada mensaje y
  pulsación de botón; si no es el tuyo, no contesta nada.
- Se comprueba la firma de cada aviso de GitHub y el secreto de Telegram.
- Los botones llevan el número de PR y repo; el bot revalida al pulsar.
- Registro (log) sin contenido de mensajes ni secretos.
- Se instala solo en los repos que tú indiques (lista fija).

## 5. Qué hace cada botón de PR (decisiones para ti)

- **Pedir cambios:** el bot te pide el comentario, lo publica en la PR y pone
  la etiqueta `corregir`. Sin dudas.
- **Rechazar:** cerrar la PR **sin fusionar** (reversible: se puede reabrir).
- **Aprobar:** hay dos lecturas y no es reversible del todo, así que no la
  decido yo: (a) solo dejar una aprobación/comentario, y fusionas tú en
  GitHub; (b) **fusionar la PR** directamente. Recomiendo **(b) con una
  segunda pulsación de confirmación** (te dice «¿Fusionar PR #N en
  main?»), porque es el objetivo de no entrar en GitHub y la fusión sigue
  entrando por PR, pero lo decides tú.

## 6. Coste total estimado

~**0 €/mes** (Cloudflare gratuito + APIs gratuitas). Si se prefiriera VPS,
4–6 €/mes. Sin verificar (ver aviso arriba).

## 7. Pruebas previstas (para cuando se programe)

- Pruebas automáticas con mensajes y avisos de ejemplo inventados: ignora a
  usuarios ajenos, crea la issue en el repo correcto, rechaza firmas falsas,
  `/estado` con datos ficticios.
- El cliente de GitHub y Telegram se sustituye por simulaciones en las
  pruebas; ninguna prueba toca repos ni chats reales.

## 8. Plan por PR pequeñas (tras aprobar esto)

1. Esqueleto + pruebas + solo usuario autorizado (bot responde «ok» a ti).
2. Crear issue desde Telegram (función 1).
3. Avisos de GitHub: PR nueva con botones y `necesita-gonzalo` (2 y 3).
4. `/estado` (4).

## 9. Qué necesito de ti (agrupado)

1. ¿Apruebas Cloudflare Workers + TypeScript?
2. «Aprobar» = (a) solo aprobar o (b) fusionar con confirmación.
3. Qué repositorios incluir (por ahora: criterio, contabilidad-autonomo,
   centro-de-mando).
4. Crear las credenciales de la sección 3 y autorizar **explícitamente** la
   publicación/despliegue cuando llegue el momento (línea roja: no publico
   nada sin ese permiso).
