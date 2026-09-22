/* ============================================================
CLINICAL HUB · TRIAGE COMPARTIDO
Acciones que se repiten en Reseñas y en Temas pedidos:
etiquetar, marcar revisado y convertir en mejora.
Cada pestaña le pasa la fila y su propia función de recarga.
============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer,
opcionesEquipo, opciones } from "./nucleo.js";

const TIPOS = [["contenido","Contenido"], ["producto","Producto"], ["proceso","Proceso"],
["soporte","Soporte"], ["otro","Otro"]];
const PRIORIDADES = [["alta","Prioridad alta"], ["media","Prioridad media"], ["baja","Prioridad baja"]];

/* Texto que describe la fila, sea reseña o petición de tema */
function rotulo(x){
return String(x.comentario || x.tema || x.tema_pedido || "").trim();
}

/* ============================================================
1. Marcar o quitar revisado
============================================================ */
export async function alternarRevisado(x, boton, recargar){
const nuevo = !x.revisado;
boton.disabled = true;
const { error } = await sb.from("feedback_triage").upsert({
feedback_id: x.id,
revisado: nuevo,
revisado_por: estado.usuario && estado.usuario.id,
revisado_en: new Date().toISOString()
}, { onConflict:"feedback_id" });
boton.disabled = false;
if (error){ avisar("No se pudo guardar el revisado.", "mal", "#aviso-panel"); return; }
x.revisado = nuevo;
avisar("", "", "#aviso-panel");
if (recargar) await recargar();
}

/* ============================================================
2. Etiquetar
============================================================ */
export function ventanaEtiquetas(x, recargar){
const actuales = x.etiquetas || [];
const cuerpo = '<div class="opciones">' + estado.etiquetas.map(e =>
'<label class="opcion"><input type="checkbox" value="' + e.clave + '"' +
(actuales.indexOf(e.clave) > -1 ? " checked" : "") + '>' +
'<span><b>' + escapar(e.nombre) + '</b><br><span class="mini">' +
escapar(e.descripcion || "") + '</span></span></label>').join("") + '</div>';

abrirVentana({
titulo: "Etiquetar",
guia: rotulo(x),
cuerpo: cuerpo,
aceptar: "Guardar etiquetas",
ancha: true,
alAceptar: async () => {
const marcadas = Array.from(document.querySelectorAll(".forma input:checked")).map(i => i.value);
const nuevas = marcadas.filter(c => actuales.indexOf(c) === -1);
const quitar = actuales.filter(c => marcadas.indexOf(c) === -1);
if (nuevas.length){
const r = await sb.from("feedback_etiquetas").insert(nuevas.map(c => ({
feedback_id: x.id, etiqueta: c, creado_por: estado.usuario && estado.usuario.id
})));
if (r.error) throw r.error;
}
if (quitar.length){
const r = await sb.from("feedback_etiquetas").delete().eq("feedback_id", x.id).in("etiqueta", quitar);
if (r.error) throw r.error;
}
if (recargar) await recargar();
}
});
}

/* ============================================================
3. Convertir en mejora
============================================================ */
export async function ventanaMejora(x, recargar){
const r = await sb.from("acciones").select("id,numero,titulo")
.in("estado", ["propuesta", "en_curso"]).order("numero", { ascending:false });
const abiertas = r.data || [];
const sugerido = rotulo(x).slice(0, 80);

const cuerpo =
'<span class="etiqueta">A qué mejora pertenece</span>' +
'<select class="campo" id="m-accion">' +
'<option value="">Crear una mejora nueva</option>' +
abiertas.map(a => '<option value="' + a.id + '">#' + a.numero + ' · ' + escapar(a.titulo) + '</option>').join("") +
'</select>' +
'<div id="m-nueva">' +
'<input class="campo" id="m-titulo" placeholder="Título de la mejora" value="' + escapar(sugerido) + '">' +
'<textarea class="campo" id="m-desc" placeholder="Qué vamos a cambiar y por qué"></textarea>' +
'<div class="campos">' +
'<select class="campo" id="m-tipo">' + opciones(TIPOS, "contenido") + '</select>' +
'<select class="campo" id="m-prioridad">' + opciones(PRIORIDADES, "media") + '</select>' +
'</div>' +
'<input class="campo" id="m-impacto" placeholder="Qué esperamos que mejore (opcional)">' +
'</div>' +
'<span class="etiqueta">Primera tarea (opcional)</span>' +
'<input class="campo" id="m-tarea" placeholder="Ej.: reescribir la sección de dosis">' +
'<div class="campos">' +
'<select class="campo" id="m-resp">' + opcionesEquipo() + '</select>' +
'<input class="campo" id="m-vence" type="date">' +
'</div>';

abrirVentana({
titulo: "Convertir en mejora",
guia: sugerido,
cuerpo: cuerpo,
aceptar: "Guardar",
ancha: true,
alAceptar: async () => {
let accionId = leer("m-accion");
if (!accionId){
const titulo = leer("m-titulo");
if (!titulo){ avisar("Ponle un título a la mejora.", "mal", "#aviso-forma"); return false; }
const nueva = await sb.from("acciones").insert({
titulo: titulo,
descripcion: leer("m-desc"),
tipo: leer("m-tipo") || "contenido",
prioridad: leer("m-prioridad") || "media",
impacto_esperado: leer("m-impacto"),
responsable_id: leer("m-resp"),
creada_por: estado.usuario && estado.usuario.id
}).select("id").single();
if (nueva.error) throw nueva.error;
accionId = nueva.data.id;
}
const v = await sb.from("accion_feedback").insert({ accion_id: accionId, feedback_id: x.id });
if (v.error && String(v.error.message).indexOf("duplicate") === -1) throw v.error;

const tarea = leer("m-tarea");
if (tarea){
const t = await sb.from("tareas").insert({
accion_id: accionId,
feedback_id: x.id,
titulo: tarea,
responsable_id: leer("m-resp"),
vence_el: leer("m-vence"),
creada_por: estado.usuario && estado.usuario.id
});
if (t.error) throw t.error;
}
if (recargar) await recargar();
}
});

const sel = document.getElementById("m-accion");
sel.addEventListener("change", () => { document.getElementById("m-nueva").hidden = !!sel.value; });
}
