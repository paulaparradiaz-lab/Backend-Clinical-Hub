# Clinical Hub · Panel

Backoffice de **Sustancia Pro** para leer el feedback de los médicos sobre las guías
clínicas, convertirlo en decisiones y llevar la cuenta de lo que se va arreglando.

En vivo: https://admn-clinicalhub.sustanciapro.com

---

## Qué hace

El panel sigue una cadena de cuatro pasos:

1. **Entra el feedback** (web y WhatsApp) a la tabla `feedback`, alimentada desde n8n.
2. **Alguien lo lee y lo clasifica**: lo marca como revisado y le pone etiquetas
   (claridad, formato, cobertura, velocidad, elogio…).
3. **Se agrupan los comentarios parecidos** en una mejora: una decisión concreta.
4. **La mejora se parte en tareas** con responsable, prioridad y estado.

La pestaña **Feedback** sirve para los pasos 1 a 3. La pestaña **Mejoras** es la
"hoja de vida" de la plataforma: qué cambiamos, por qué feedback lo cambiamos,
quién lo hizo y qué pasó con las notas después.

---

## Cómo está organizado

Sitio estático, sin build ni dependencias que compilar. Módulos ES nativos y
`supabase-js` desde CDN.

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Todo el HTML base y **todo el CSS** (tokens, componentes, responsive). |
| `js/nucleo.js` | Cliente de Supabase, estado compartido, ventanas modales y utilidades (fechas, números, escapado). |
| `js/panel.js` | Acceso con 2FA, barra superior y carga de cada pestaña como módulo. |
| `js/feedback.js` | Pestaña Feedback: filtros, KPIs, gráfica mes a mes, temas pedidos y lista de comentarios. |
| `js/mejoras.js` | Pestaña Mejoras: hoja de vida, tareas e impacto. |
| `CNAME` | Dominio propio de GitHub Pages. |

Cada archivo de pestaña exporta una función `render()` que pinta dentro de
`#vista`. Añadir una pestaña nueva es crear un módulo con ese contrato y
registrarlo en `panel.js`.

---

## Qué usa de Supabase

Proyecto: **Clinical hub - Backoffice**.

**Tablas**

| Tabla | Qué guarda |
| --- | --- |
| `feedback` | Las respuestas de los médicos. La llena n8n. |
| `feedback_triage` | Si un comentario ya fue revisado y por quién. |
| `etiquetas` | Catálogo de etiquetas. |
| `feedback_etiquetas` | Qué etiqueta tiene cada comentario. |
| `acciones` | Las mejoras decididas. |
| `accion_feedback` | Qué comentarios originaron cada mejora. |
| `tareas` | Las tareas de cada mejora, con responsable y estado. |
| `equipo` | Las personas que pueden ser responsables. |

**Vistas que lee el panel**

- `v_feedback_detalle` — feedback + triage + etiquetas + si ya tiene mejora.
- `v_hoja_de_vida` — las mejoras con su contexto.
- `v_tareas_detalle` — las tareas con su responsable y su mejora.

**Seguridad**

- Todas las tablas tienen RLS activo.
- Política permisiva para el rol `authenticated` y política **restrictiva** que
  exige `aal2`: sin segundo factor no se ve nada.
- Las vistas se crearon con `security_invoker = true`, así que respetan el RLS
  de quien consulta en vez de saltárselo.
- No se concede `delete` sobre `acciones` ni `tareas`: para descartar algo se usa
  el estado `descartada`, de modo que la historia nunca se pierde.

---

## Despliegue

GitHub Pages desde la rama `main`. Cada commit dispara el workflow
*pages-build-deployment*; tarda entre uno y cinco minutos. No hay que compilar nada.

Después de un despliegue conviene recargar con **Cmd+Shift+R** para que el
navegador suelte la versión cacheada de los módulos.

---

## Convenciones

- Nombres, comentarios y textos de interfaz en español.
- Cada módulo está dividido en secciones numeradas con un comentario de cabecera.
- El CSS vive únicamente en `index.html`; los módulos no inyectan estilos.
- Las animaciones respetan `prefers-reduced-motion`.
- El correo y el teléfono de quien deja feedback no se muestran por defecto.

---

## Pendientes conocidos

- El análisis de temas es manual (agrupación por texto normalizado); no hay
  clasificación automática todavía.
- La tabla `analisis` existe pero el panel aún no la usa.
