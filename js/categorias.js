/* ============================================================
   CLINICAL HUB · CATEGORÍAS DE RESEÑAS
   El catálogo de public.etiquetas se administra desde el panel,
   igual que los temas en Temas pedidos: se crean, se renombran
   y se borran sin entrar a Supabase.

   clave        Lo que queda guardado en cada reseña, en
                feedback_etiquetas.etiqueta. No se toca nunca: si
                cambiara, las reseñas perderían su categoría. Se
                genera sola a partir del nombre.
   nombre       Lo que se ve en pantalla. Esto es lo que renombras.
   descripcion  La ayuda que sale en la ventana de categorizar.

   Borrar nunca deja una reseña colgada: primero se decide qué
   pasa con las que tenían esa categoría —se mueven a otra, a una
   nueva, o vuelven al inbox—, después se limpian los vínculos
   viejos y solo al final se borra la fila del catálogo.
   ============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer,
  cargarCatalogos } from "./nucleo.js";

const INBOX = "__inbox__";

function plural(n, uno, varios){
return n + " " + (n === 1 ? uno : varios);
}

export function categoriaPorClave(clave){
return estado.etiquetas.filter(e => e.clave === clave)[0] || null;
}

/* La clave sale del nombre: minúsculas, sin tildes y con guion
   bajo. Nunca se le pide al usuario. */
const SIN_TILDE = { "á":"a", "é":"e", "í":"i", "ó":"o", "ú":"u", "ü":"u", "ñ":"n" };

export function claveDe(nombre){
const s = String(nombre || "").toLowerCase();
let out = "";
for (let i = 0; i < s.length; i++){
const c = SIN_TILDE[s[i]] || s[i];
out += ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) ? c : "_";
}
while (out.indexOf("__") > -1) out = out.split("__").join("_");
while (out.charAt(0) === "_") out = out.slice(1);
while (out.charAt(out.length - 1) === "_") out = out.slice(0, -1);
return out.slice(0, 40) || "categoria";
}

/* ============================================================
   1. Crear
   Si la clave ya existe porque esa categoría estuvo archivada,
   se reusa y se deja activa otra vez en vez de fallar.
   ============================================================ */
export async function crearCategoria(nombre, descripcion){
const clave = claveDe(nombre);
const ya = categoriaPorClave(clave);
if (ya) return clave;
const orden = estado.etiquetas.reduce((a, e) => Math.max(a, e.orden || 0), 0) + 1;
const r = await sb.from("etiquetas").upsert({
clave: clave,
nombre: nombre,
descripcion: descripcion || null,
orden: orden,
activa: true
}, { onConflict:"clave" });
if (r.error) throw r.error;
await cargarCatalogos();
return clave;
}

export function ventanaNuevaCategoria(recargar){
const cuerpo =
'<span class="etiqueta">Nombre de la categoría</span>' +
'<input class="campo" id="k-nombre" placeholder="Ej.: Errores de contenido">' +
'<span class="etiqueta">Ayuda (opcional)</span>' +
'<input class="campo" id="k-desc" placeholder="Cuándo usarla, en una línea">' +
'<p class="mini">Aparece de una en la ventana de categorizar, en el filtro y en la gráfica ' +
'de tipo de problema. El nombre se puede cambiar después sin perder nada.</p>';

abrirVentana({
titulo: "Nueva categoría",
cuerpo: cuerpo,
aceptar: "Crear categoría",
alAceptar: async () => {
const nombre = leer("k-nombre");
if (!nombre){ avisar("Ponle un nombre a la categoría.", "mal", "#aviso-forma"); return false; }
await crearCategoria(nombre, leer("k-desc"));
avisar("Categoría “" + nombre + "” creada.", "", "#aviso-panel");
if (recargar) await recargar();
}
});
}

/* ============================================================
   2. Renombrar
   Cambia solo lo que se ve. Por dentro sigue siendo la misma
   clave, así que las reseñas ya categorizadas no se mueven.
   ============================================================ */
export function ventanaRenombrarCategoria(cat, recargar){
const cuerpo =
'<span class="etiqueta">Nombre de la categoría</span>' +
'<input class="campo" id="e-nombre" value="' + escapar(cat.nombre) + '">' +
'<span class="etiqueta">Ayuda (opcional)</span>' +
'<input class="campo" id="e-desc" value="' + escapar(cat.descripcion || "") + '">' +
'<p class="mini">Se guarda en Supabase (tabla etiquetas) y se actualiza en todo el panel. ' +
'Las reseñas que ya tienen esta categoría no se mueven.</p>';

abrirVentana({
titulo: "Renombrar categoría",
guia: cat.nombre,
cuerpo: cuerpo,
aceptar: "Guardar",
alAceptar: async () => {
const nombre = leer("e-nombre");
if (!nombre){ avisar("Ponle un nombre a la categoría.", "mal", "#aviso-forma"); return false; }
const r = await sb.from("etiquetas")
.update({ nombre: nombre, descripcion: leer("e-desc") })
.eq("clave", cat.clave);
if (r.error) throw r.error;
await cargarCatalogos();
avisar("Categoría renombrada a “" + nombre + "”.", "", "#aviso-panel");
if (recargar) await recargar();
}
});
}

/* ============================================================
   3. Borrar
   Igual que borrar un tema en Temas pedidos: primero se decide a
   dónde van sus reseñas y después se borra la categoría. Lo que
   escribió el médico no se toca nunca: vive en feedback.
   ============================================================ */
export function ventanaBorrarCategoria(cat, lista, recargar){
const conEsa = lista || [];
const cuantas = conEsa.length;
const otras = estado.etiquetas.filter(e => e.clave !== cat.clave);

const cuerpo = cuantas
? '<p class="mini"><b>¿Seguro que quieres borrar esta categoría?</b> La tienen ' +
plural(cuantas, "reseña", "reseñas") + '. Antes de borrarla hay que decidir qué pasa con ' +
'ellas: no se pierde ninguna.</p>' +
'<span class="etiqueta">Esas reseñas</span>' +
'<select class="campo" id="k-destino">' +
otras.map(e => '<option value="' + escapar(e.clave) + '">Pasan a ' + escapar(e.nombre) + '</option>').join("") +
'<option value="">Pasan a una categoría nueva</option>' +
'<option value="' + INBOX + '">Se quedan sin categoría · vuelven al inbox</option>' +
'</select>' +
'<input class="campo" id="k-nueva" placeholder="Nombre de la categoría nueva">' +
'<p class="mini">El campo de abajo solo se usa si eliges pasarlas a una categoría nueva.</p>'
: '<p class="mini"><b>¿Seguro que quieres borrar esta categoría?</b> No la tiene ninguna ' +
'reseña, así que se puede borrar sin mover nada.</p>';

abrirVentana({
titulo: "Borrar categoría",
guia: cat.nombre,
cuerpo: cuerpo,
aceptar: cuantas ? "Sí, mover y borrar" : "Sí, borrar la categoría",
alAceptar: async () => {
if (cuantas){
let destino = leer("k-destino");
const alInbox = destino === INBOX;
if (!destino){
const nombre = leer("k-nueva");
if (!nombre){
avisar("Elige una categoría de la lista o escribe el nombre de la nueva.", "mal", "#aviso-forma");
return false;
}
destino = await crearCategoria(nombre, null);
}
if (destino === cat.clave){
avisar("Elige una categoría distinta a la que vas a borrar.", "mal", "#aviso-forma");
return false;
}
if (!alInbox){
const nuevas = conEsa
.filter(x => (x.etiquetas || []).indexOf(destino) === -1)
.map(x => ({ feedback_id:x.id, etiqueta:destino,
creado_por: estado.usuario && estado.usuario.id }));
if (nuevas.length){
const mover = await sb.from("feedback_etiquetas").insert(nuevas);
if (mover.error) throw mover.error;
}
}
const limpiar = await sb.from("feedback_etiquetas").delete().eq("etiqueta", cat.clave);
if (limpiar.error) throw limpiar.error;
}
const borrar = await sb.from("etiquetas").delete().eq("clave", cat.clave);
if (borrar.error) throw borrar.error;
await cargarCatalogos();
avisar("Categoría borrada" + (cuantas ? " · sus reseñas se movieron a donde elegiste." : "."),
"", "#aviso-panel");
if (recargar) await recargar();
}
});
}
