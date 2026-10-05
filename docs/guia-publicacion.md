# Guía de publicación del bot (sin terminal)

> Estado: **borrador preparado por un agente (issue #19).** Nada de esto se ha
> ejecutado ni comprobado contra Cloudflare, Telegram o GitHub reales: los
> nombres de menús pueden haber cambiado, así que si algo no coincide, para y
> pregunta. **No hay todavía despliegue automático**: el sistema de permisos
> bloqueó crear el workflow de despliegue en la ejecución automática y hay que
> hacerlo en sesión interactiva (ver issue #19). Los pasos 1–2 y 6 dependen de
> ese workflow; el resto vale igual.

Resumen: son seis pasos, todos desde el navegador o la app de Telegram. Los
valores secretos **nunca** se pegan en chats, issues ni PR.

## Paso 1 — Cuenta de Cloudflare

1. Entra en <https://dash.cloudflare.com/sign-up> y crea una cuenta gratuita
   (correo y contraseña; confirma el correo).
2. No hace falta añadir dominio ni tarjeta.
3. Anota tu **Account ID**: en el panel, menú **Workers & Pages**; aparece a
   la derecha (no es secreto, pero lo necesitarás en el paso 2).

## Paso 2 — Token de API de Cloudflare (permisos mínimos) como secreto de GitHub

Es la llave con la que GitHub publicará el bot en tu cuenta de Cloudflare.

1. En Cloudflare: icono de perfil → **My Profile** → **API Tokens** →
   **Create Token**.
2. Elige la plantilla **Edit Cloudflare Workers** y revisa que los permisos
   sean solo los de Workers de **tu cuenta** (nada de zonas/dominios ni de
   otras cuentas). Si te deja, pon caducidad (por ejemplo 90 días).
3. **Create Token** y copia el valor (solo se muestra una vez).
4. En GitHub: repo `trove-empresas/centro-de-mando` → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**.
   - Nombre `CLOUDFLARE_API_TOKEN`, valor: el token.
   - Otro secreto: `CLOUDFLARE_ACCOUNT_ID`, valor: el Account ID del paso 1.

## Paso 3 — Token de GitHub de grano fino, ID de Telegram y secretos de webhook

Sigue en `docs/arquitectura.md` §3: **paso A** (token de GitHub, con permisos
mínimos y solo los tres repos), **paso B** (tu ID de Telegram) y **paso C**
(dos cadenas aleatorias, una para Telegram y otra para GitHub). Apúntalos
aparte, sin pegarlos en ningún sitio compartido.

## Paso 4 — Secretos del bot en el panel de Cloudflare

Una vez el bot esté publicado por primera vez (aparecerá en **Workers &
Pages** con el nombre `centro-de-mando`):

1. Entra en el Worker → **Settings** → **Variables and Secrets** →
   **Add**. En cada una elige el tipo **Secret** (cifrado).
2. Crea estas cinco, con los valores del paso 3 y del BotFather:
   - `TELEGRAM_BOT_TOKEN` — el token de tu bot de Telegram.
   - `TELEGRAM_WEBHOOK_SECRET` — la cadena del webhook de Telegram.
   - `TELEGRAM_ALLOWED_USER_ID` — tu ID numérico de Telegram.
   - `GITHUB_TOKEN` — el token de GitHub de grano fino (`github_pat_…`).
   - `GITHUB_WEBHOOK_SECRET` — la cadena del webhook de GitHub.
3. **Deploy** para que se apliquen. Opcional: `GITHUB_ALLOWED_REPOS` solo si
   quieres cambiar la lista de repos.

## Paso 5 — Registrar los webhooks

Necesitas la dirección pública del bot (algo como
`https://centro-de-mando.<tu-subdominio>.workers.dev`; la ves en el Worker).

**Telegram.** Telegram no tiene pantalla para esto: se registra abriendo una
dirección en el navegador (sustituye lo que va entre `<>` y no compartas la
dirección):

`https://api.telegram.org/bot<TOKEN_DEL_BOT>/setWebhook?url=<DIRECCION_DEL_BOT>/telegram&secret_token=<SECRETO_WEBHOOK_TELEGRAM>`

Debe responder `{"ok":true,...}`. Si da error, copia solo el mensaje de error
(sin el token) al chat.

**GitHub** (hay que hacerlo en cada uno de los tres repos): repo →
**Settings** → **Webhooks** → **Add webhook**.
- **Payload URL:** `<DIRECCION_DEL_BOT>/github`
- **Content type:** `application/json`
- **Secret:** la cadena del webhook de GitHub.
- **Which events:** *Let me select individual events* y marca **Issues** y
  **Pull requests** (y nada más). Si no marcas Pull requests, el bot no avisa
  de PR nuevas.
- **Active** marcado → **Add webhook**.

## Paso 6 — Primera prueba

1. Escribe `/estado` al bot en Telegram: debe contestarte con el resumen.
2. Pon la etiqueta `necesita-gonzalo` a una issue de prueba: debe llegarte
   aviso.
3. Si algo falla, no pegues secretos: dime qué ves y lo revisamos juntos.

## Si un secreto se filtra

Revócalo en su origen (BotFather, GitHub o Cloudflare), crea otro y actualízalo
en el panel. No hay que tocar código.
