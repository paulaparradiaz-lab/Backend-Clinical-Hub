/* ============================================================
CLINICAL HUB · TRIAGE COMPARTIDO
Acciones que se repiten en Reseñas y en Temas pedidos:
etiquetar, marcar revisado y convertir en mejora.
Cada pestaña le pasa la fila y su propia función de recarga.
============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer,
opcionesEquipo, opciones, traducirError } from "./nucleo.js";
import { crearCategoria } from "./categorias.js";

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


/* ============================================================
4. Categorizar reseñas (una o varias de una vez)
El inbox de Reseñas manda con esto: mientras una reseña con
comentario no tenga categoría, sigue ahí. Al ponerle categoría
también queda marcada como revisada, así "revisado" y
"categorizado" no son dos cuentas distintas.
============================================================ */
export const DESCARTE = "sin_sentido";

async function ponerEtiquetas(lista, claves){
const nuevas = [];
lista.forEach(x => {
const ya = x.etiquetas || [];
claves.forEach(c => {
if (ya.indexOf(c) === -1) nuevas.push({ feedback_id:x.id, etiqueta:c,
creado_por: estado.usuario && estado.usuario.id });
});
});
if (nuevas.length){
const r = await sb.from("feedback_etiquetas").insert(nuevas);
if (r.error) throw r.error;
}
const porRevisar = lista.filter(x => !x.revisado).map(x => x.id);
if (porRevisar.length){
const t = await sb.from("feedback_triage").upsert(porRevisar.map(id => ({
feedback_id: id,
revisado: true,
revisado_por: estado.usuario && estado.usuario.id,
revisado_en: new Date().toISOString()
})), { onConflict:"feedback_id" });
if (t.error) throw t.error;
}
}

/* Si es una sola, las categorías que ya tenía vienen marcadas y se
pueden quitar. Si son varias, lo marcado se suma y no se le quita
nada a ninguna. Y si ninguna categoría sirve, se crea aquí mismo
sin cerrar la ventana, igual que los temas nuevos en Temas pedidos. */
export function ventanaCategoria(lista, recargar){
const una = lista.length === 1;
const actuales = una ? (lista[0].etiquetas || []) : [];
let marcadas = actuales.slice();

const cuerpo =
'<div id="k-opciones"></div>' +
(una ? '' : '<p class="mini">Se le pone a las ' + lista.length +
' reseñas elegidas. Lo que ya tuvieran se conserva.</p>') +
'<span class="etiqueta">O crear una categoría nueva</span>' +
'<div style="display:flex;gap:8px;align-items:center">' +
'<input class="campo" id="k-nueva" style="flex:1 1 auto;margin:0" ' +
'placeholder="Ej.: Errores de contenido">' +
'<button class="boton-chico" id="k-anadir" type="button">Añadir</button>' +
'</div>' +
'<p class="mini">Añadir la crea y la deja marcada aquí mismo, sin cerrar la ventana. ' +
'El nombre se puede cambiar después desde Tipo de problema.</p>';

/* La lista se repinta cuando creas una categoría, así que lo marcado
vive en «marcadas» y no en el DOM. */
function pintarOpciones(){
const caja = document.getElementById("k-opciones");
if (!caja) return;
caja.innerHTML = '<div class="opciones">' + estado.etiquetas.map(e =>
'<label class="opcion"><input type="checkbox" class="k-cat" value="' + e.clave + '"' +
(marcadas.indexOf(e.clave) > -1 ? " checked" : "") + '>' +
'<span><b>' + escapar(e.nombre) + '</b><br><span class="mini">' +
escapar(e.descripcion || "") + '</span></span></label>').join("") + '</div>';
}

async function anadir(){
const btn = document.getElementById("k-anadir");
const nombre = leer("k-nueva");
if (!nombre){ avisar("Escribe el nombre de la categoría nueva.", "mal", "#aviso-forma"); return; }
if (btn){ btn.disabled = true; btn.textContent = "Creando…"; }
try {
const clave = await crearCategoria(nombre, null);
if (marcadas.indexOf(clave) === -1) marcadas.push(clave);
pintarOpciones();
const inp = document.getElementById("k-nueva");
if (inp){ inp.value = ""; inp.focus(); }
avisar("Categoría “" + nombre + "” creada y marcada.", "", "#aviso-forma");
} catch (err){
avisar(traducirError(err && err.message), "mal", "#aviso-forma");
} finally {
if (btn){ btn.disabled = false; btn.textContent = "Añadir"; }
}
}

abrirVentana({
titulo: una ? "Categorizar" : "Categorizar " + lista.length + " reseñas",
guia: una ? rotulo(lista[0]) : "",
cuerpo: cuerpo,
aceptar: una ? "Guardar categoría" : "Categorizar las " + lista.length,
ancha: true,
alAceptar: async () => {
const elegidas = Array.prototype.map.call(document.querySelectorAll(".k-cat:checked"), i => i.value);
if (!elegidas.length){
avisar("Elige al menos una categoría o crea una nueva.", "mal", "#aviso-forma");
return false;
}
if (una){
const quitar = actuales.filter(c => elegidas.indexOf(c) === -1);
if (quitar.length){
const r = await sb.from("feedback_etiquetas").delete()
.eq("feedback_id", lista[0].id).in("etiqueta", quitar);
if (r.error) throw r.error;
}
}
await ponerEtiquetas(lista, elegidas);
if (recargar) await recargar();
}
});

pintarOpciones();

const caja = document.getElementById("k-opciones");
if (caja) caja.addEventListener("change", e => {
const cb = e.target && e.target.closest ? e.target.closest(".k-cat") : null;
if (!cb) return;
const v = String(cb.value);
if (cb.checked){ if (marcadas.indexOf(v) === -1) marcadas.push(v); }
else marcadas = marcadas.filter(x => x !== v);
});

const btnAdd = document.getElementById("k-anadir");
if (btnAdd) btnAdd.onclick = anadir;

const campo = document.getElementById("k-nueva");
if (campo) campo.addEventListener("keydown", e => {
if (e.key === "Enter"){ e.preventDefault(); anadir(); }
});
}

/* Descartar no borra nada: le pone la categoría "sin sentido", que es
la que ya existe para lo que no aporta. Se deshace reetiquetando
desde la lista del ranking. */
export async function descartarResenas(lista, recargar){
if (!lista.length) return;
try { await ponerEtiquetas(lista, [DESCARTE]); }
catch (err){
avisar("No se pudo descartar. Intenta de nuevo.", "mal", "#aviso-panel");
return;
}
avisar("", "", "#aviso-panel");
if (recargar) await recargar();
}
