# Arquitectura propuesta — centro-de-mando v1

> Estado: **decisiones principales aprobadas por Gonzalo (2026-10-05)**; falta
> que fusione esta PR. No hay código.
> **Coste NO verificado:** Gonzalo pidió comprobarlo en la página oficial de
> precios de Cloudflare y anotarlo con fecha de consulta. El 2026-10-05
> intenté consultar `developers.cloudflare.com/workers/platform/pricing/` y
> el entorno donde trabajo bloquea ese dominio, así que **no he podido
> verificarlo**. Las cifras de abajo siguen siendo estimaciones de memoria.
> Pendiente: que Gonzalo (o una ejecución con acceso) lo compruebe en
> https://developers.cloudflare.com/workers/platform/pricing/ y rellene la
> fecha de consulta en la sección 6.

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

**Aprobado por Gonzalo (2026-10-05):** Cloudflare Workers con TypeScript.
Registrado en `docs/decisiones.md`. (Python en Workers existe pero es más
limitado.)

## 3. Credenciales necesarias (las creas tú)

Resumen: **cuatro cosas** que crear o localizar, más dos cadenas secretas que
te inventas. Todo se guarda en el almacén de secretos de Cloudflare, nunca en
el repositorio.

| Credencial | Para qué | Estado |
|---|---|---|
| Token del bot de Telegram | Que el bot envíe y reciba | Ya lo tienes |
| Tu ID numérico de Telegram | Que solo te responda a ti | Hay que obtenerlo (paso B) |
| Token de GitHub de grano fino | Crear issues, etiquetar, comentar, fusionar PR | Hay que crearlo (paso A) |
| Secreto del webhook de Telegram | Comprobar que los mensajes vienen de Telegram | Cadena aleatoria (paso C) |
| Secreto del webhook de GitHub | Comprobar la firma de los avisos de GitHub | Cadena aleatoria (paso C) |

### Paso A — Token de GitHub de grano fino (fine-grained)

Es una «llave» de GitHub que solo abre lo que tú marques y caduca sola.

1. En GitHub, pulsa tu foto (arriba a la derecha) → **Settings**.
2. Abajo del todo, a la izquierda: **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
3. **Token name:** `centro-de-mando`.
4. **Expiration (caducidad):** elige una fecha límite (recomendado 90 días;
   apúntate en el calendario renovarlo).
5. **Resource owner:** `trove-empresas`.
6. **Repository access:** **Only select repositories** y marca solo
   `criterio`, `contabilidad-autonomo` y `centro-de-mando`. Ningún otro.
7. **Permissions → Repository permissions** (todo lo demás en «No access»):
   - **Issues:** Read and write
   - **Pull requests:** Read and write
   - **Metadata:** Read-only (se marca sola)
   - **Contents:** Read-only *solo si* la comprobación de «comprobaciones
     obligatorias en verde» antes de fusionar lo necesitara; si no, sin
     acceso. Se confirmará al programar esa parte y se actualizará aquí.
   - **Administration: sin acceso** (así el bot no puede tocar ajustes ni
     protección de ramas: línea roja).
8. **Generate token** y copia el valor (empieza por `github_pat_`).
   **Solo se muestra una vez.** No lo pegues en chats, issues ni PR: lo
   pondrás en Cloudflare en el momento de desplegar.

Nota: si la organización exige aprobar los tokens de grano fino, un
propietario tendrá que aprobarlo en la configuración de la organización.

### Paso B — Tu ID de usuario de Telegram

Es un número (no es secreto) que identifica tu cuenta.

1. En Telegram, busca el bot **@userinfobot** y escríbele `/start`.
2. Te contesta con tu `Id:` (un número). Apúntalo.
3. Se pondrá en la configuración del bot, no en el código.

(Alternativa sin bots de terceros: cuando el bot de v1 esté en marcha, en
modo de prueba te dirá el ID de quien le escribe.)

### Paso C — Dos secretos de webhook

Son cadenas largas y aleatorias que sirven de contraseña entre Telegram o
GitHub y el bot. Genera una distinta para cada uno (mínimo 32 caracteres), por
ejemplo con un gestor de contraseñas. Solo letras, números, `-` y `_`
(Telegram no admite otros caracteres en el suyo).

### Cómo se guardan

- Solo en el almacén de secretos de Cloudflare (`wrangler secret put`), nunca
  en el repositorio, ni en ejemplos, ni en el historial (línea roja).
- El repo tendrá un `.env.example` solo con los **nombres** de las variables.
- Si un secreto se filtra: se revoca en su origen (BotFather / GitHub) y se
  crea otro; no hay que tocar código.

## 4. Seguridad

- **Solo tu usuario:** el bot comprueba el ID de Telegram en cada mensaje y
  pulsación de botón; si no es el tuyo, no contesta nada.
- **El Worker verifica que cada mensaje viene de quien dice:**
  - Telegram: cada llamada trae la cabecera
    `X-Telegram-Bot-Api-Secret-Token`; se compara con el secreto del webhook
    de Telegram y, si no coincide, se rechaza sin procesar nada.
  - GitHub: cada aviso trae la cabecera `X-Hub-Signature-256` (firma HMAC
    SHA-256 del contenido con el secreto del webhook de GitHub); se
    recalcula y compara en tiempo constante y, si no coincide, se rechaza.
  - Ambas comprobaciones se hacen **antes** de leer el contenido, y llevan
    pruebas automáticas con firmas falsas.
- Los botones llevan el número de PR y repo; el bot revalida al pulsar.
- Registro (log) sin contenido de mensajes ni secretos.
- Solo actúa sobre los repos de una **lista configurable** (por ahora:
  `criterio`, `contabilidad-autonomo` y `centro-de-mando`); para añadir un
  proyecto basta cambiar la configuración, sin tocar código. Cualquier otro
  repositorio de la cuenta se rechaza.

## 5. Qué hace cada botón de PR (decidido por Gonzalo)

- **Pedir cambios:** el bot te pide el comentario, lo publica en la PR y pone
  la etiqueta `corregir`.
- **Rechazar:** cerrar la PR **sin fusionar** (reversible: se puede reabrir).
- **Aprobar:** **fusiona la PR tras una segunda confirmación** (el bot
  pregunta «¿Fusionar PR #N en main?» y solo fusiona si pulsas confirmar).
  Antes de fusionar, el bot comprueba que las comprobaciones obligatorias de
  la PR están en verde; si no lo están, **no fusiona** y te explica por qué.
  La fusión sigue entrando por PR (no hay push directo a `main`).

## 5 bis. Etiquetas automáticas: comando `/etiquetas`

Un agente no puede crear las etiquetas `necesita-gonzalo` y `corregir`. Al
añadir un repositorio a la lista (`GITHUB_ALLOWED_REPOS`), envía `/etiquetas`
al bot: crea en **cada repo de la lista** las que falten y no toca las que ya
existen (se puede repetir sin problema). Fuera de la lista no actúa. Crear
etiquetas usa el permiso **Issues: Read and write** ya previsto en la sección 3
(según mi lectura de la documentación de GitHub; **no verificado contra GitHub
real**: si diera 403, hay que revisar el permiso del token).

## 6. Coste total estimado

~**0 €/mes** (Cloudflare gratuito + APIs gratuitas). Si se prefiriera VPS,
4–6 €/mes.

**Fecha de consulta de la página oficial de precios: PENDIENTE.** El
2026-10-05 no pude acceder (dominio bloqueado desde mi entorno), así que esta
cifra no está verificada. Hay que rellenar aquí el importe real y la fecha
cuando alguien con acceso lo compruebe.

## 7. Pruebas previstas (para cuando se programe)

- Pruebas automáticas con mensajes y avisos de ejemplo inventados: ignora a
  usuarios ajenos, crea la issue en el repo correcto, rechaza firmas falsas
  y secretos de Telegram incorrectos, no actúa sobre repos fuera de la lista,
  «Aprobar» no fusiona sin segunda confirmación ni con comprobaciones en
  rojo, `/estado` con datos ficticios.
- El cliente de GitHub y Telegram se sustituye por simulaciones en las
  pruebas; ninguna prueba toca repos ni chats reales.

## 8. Plan por PR pequeñas (tras fusionar esta PR)

Gonzalo pidió: cuando fusione esta PR, trocear la v1 en issues y empezar a
construir.

1. Esqueleto + pruebas + solo usuario autorizado (bot responde «ok» a ti) +
   verificación de secretos de Telegram.
2. Crear issue desde Telegram (función 1) con la lista configurable de repos.
3. Avisos de GitHub (con verificación de firma): PR nueva con botones y
   `necesita-gonzalo` (2 y 3).
4. Botones: pedir cambios, rechazar y aprobar con confirmación.
5. `/estado` (4).

## 9. Qué queda pendiente de Gonzalo

1. Crear el token de GitHub y obtener tu ID de Telegram (sección 3).
2. Verificar el coste en la página oficial de Cloudflare (sección 6), si no
   lo hace antes una ejecución con acceso.
3. Autorizar **explícitamente** la publicación/despliegue cuando llegue el
   momento (línea roja: no publico nada sin ese permiso).
