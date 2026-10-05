# CLAUDE.md — centro-de-mando

## Reglas generales

Las reglas generales de trabajo están en el `CLAUDE.md` del repositorio
[`trove-empresas/criterio`](https://github.com/trove-empresas/criterio).
**Esas reglas prevalecen** sobre lo que diga este archivo. Si ves un choque
entre ambos, no elijas por tu cuenta: pregunta a Gonzalo, como indica
`criterio`, y señala la contradicción para corregirla aquí.

Este archivo solo añade lo propio de este proyecto.

## Al empezar cada sesión

1. **Lee primero el `CLAUDE.md` de `trove-empresas/criterio`** (y los
   procedimientos que cite para la tarea), antes de tocar nada aquí.
2. Después, este archivo y los documentos de `docs/` que afecten a la tarea.

## De dónde llegan las instrucciones

Las instrucciones llegan como **issues de este repositorio** (plantilla
«Instrucción», pensada para escribirse desde el móvil). Cada issue se
trabaja con el procedimiento `procedimientos/trabajar-issue.md` de
`criterio`: una rama y una pull request por issue, enlazada con «Closes #N».

## Qué es este proyecto

Centro de mando por Telegram para que Gonzalo gestione sus proyectos desde el
móvil sin entrar en GitHub: crear instrucciones (issues), recibir y resolver
PR, avisos de `necesita-gonzalo` y un comando `/estado`. Objetivo y alcance
de la v1 en la issue #1. Arquitectura propuesta en `docs/arquitectura.md`.

## Principios propios de este proyecto

1. **Solo responde a Gonzalo.** Todo mensaje de otro usuario de Telegram se
   ignora sin respuesta.
2. **Los secretos nunca entran en el repositorio**: viven solo en el
   almacén de secretos del alojamiento (ver `docs/arquitectura.md`).
3. **Nada se publica ni despliega sin permiso explícito de Gonzalo.**
