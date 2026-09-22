/* ============================================================
   CLINICAL HUB · CLASIFICAR TEMAS PEDIDOS
   n8n guarda en Supabase el texto tal cual lo escribió el médico
   y aquí no se toca nunca. La clasificación es MANUAL: cada
   feedback nuevo llega a la bandeja y uno lo manda a los temas
   que uno mismo armó. Una petición puede estar en varios temas.

     tema_canonico : los temas que tú creaste (se pueden renombrar)
     tema_peticion : esta petición cuenta para este tema

   Nada es automático: si no está en tema_peticion, está en la
   bandeja esperando que alguien la clasifique.
   ============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer, fecha, traducirError } from "./nucleo.js";

export const clasif = { temas: [], porPeticion: new Map(), descartado: null };

function unicos(a){
  return a.filter((v, i, t) => t.indexOf(v) === i);
}

function plural(n, uno, varios){
  return n + " " + (n === 1 ? uno : varios);
}

/* ============================================================
   1. Leer la clasificación
   ============================================================ */
export async function cargarClasificacion(){
  const a = await sb.from("tema_canonico").select("id,nombre,descartado").order("nombre");
  const b = await sb.from("tema_peticion").select("feedback_id,tema_id");
  const err = a.error || b.error;
  if (err){
    avisar("No se pudo leer la clasificación de temas. " + err.message, "mal", "#aviso-panel");
    return clasif;
  }
  clasif.temas = a.data || [];
  clasif.descartado = clasif.temas.filter(t => t.descartado)[0] || null;
  const m = new Map();
  (b.data || []).forEach(r => {
    if (!m.has(r.feedback_id)) m.set(r.feedback_id, []);
    m.get(r.feedback_id).push(r.tema_id);
  });
  clasif.porPeticion = m;
  return clasif;
}

export function temasVivos(){
  return clasif.temas.filter(t => !t.descartado);
}

export function temaPorId(id){
  return clasif.temas.filter(t => t.id === id)[0] || null;
}

/* En qué temas está esta petición. Vacío = sigue en la bandeja */
export function temaIdsDe(x){
  return clasif.porPeticion.get(x.id) || [];
}

export function esDescartada(x){
  const ids = temaIdsDe(x);
  if (!ids.length) return false;
  return ids.every(id => { const t = temaPorId(id); return !!(t && t.descartado); });
}

export function nombresDe(x){
  return temaIdsDe(x)
    .map(id => { const t = temaPorId(id); return t ? t.nombre : ""; })
    .filter(Boolean);
}

/* ============================================================
   2. Clasificar peticiones
   Se usa desde la bandeja (una o varias a la vez) y desde el
   modal de comentarios de un tema.
   ============================================================ */
export function ventanaClasificar(op){
const ids = unicos(op.ids || []);
if (!ids.length) return;
const pets = op.peticiones || [];
let marcados = unicos((op.actuales || []).map(String));
let filtro = "";

const lectura = pets.length
? '<span class="etiqueta">Lo que escribió el médico</span>' +
'<div id="c-lectura"' + (pets.length > 1 ? ' style="max-height:210px;overflow:auto"' : '') + '>' +
pets.map(tarjetaLectura).join("") + '</div>'
: '';

const cuerpo = lectura +
'<p class="mini">El texto del médico no se toca. Aquí solo decides en qué temas cuenta.</p>' +
'<span class="etiqueta">Mandar a un tema que ya existe</span>' +
'<input class="campo" id="c-buscar" placeholder="Buscar entre tus temas…">' +
'<div class="lista-temas" id="c-lista" style="max-height:200px;overflow:auto"></div>' +
'<p class="mini" id="c-marcados"></p>' +
'<span class="etiqueta">O crear temas nuevos</span>' +
'<div style="display:flex;gap:8px;align-items:center">' +
'<input class="campo" id="c-nuevos" style="flex:1 1 auto;margin:0" placeholder="Ej.: Shock séptico, Lesión renal aguda">' +
'<button class="boton-chico" id="c-anadir" type="button">Añadir</button>' +
'</div>' +
'<p class="mini">Añadir guarda de una y deja la ventana abierta, para que le sigas poniendo temas ' +
'a la misma petición. Separa con comas si quieres varios de un golpe.</p>' +
'<label class="opcion-tema" style="display:block;margin:4px 0"><input type="checkbox" id="c-limpiar">' +
' Dejar sin clasificar · devolver a la bandeja</label>';

/* La lista se repinta cuando buscas o cuando creas un tema nuevo,
así que lo marcado vive en «marcados» y no en el DOM: si un tema
queda escondido por la búsqueda, sigue marcado igual. */
function pintarLista(){
const caja = document.getElementById("c-lista");
if (!caja) return;
const vivos = temasVivos();
const q = filtro.trim().toLowerCase();
const vistos = q ? vivos.filter(t => String(t.nombre).toLowerCase().indexOf(q) > -1) : vivos;
caja.innerHTML = vistos.length
? vistos.map(t => '<label class="opcion-tema" style="display:block;margin:4px 0">' +
'<input type="checkbox" class="c-tema" value="' + t.id + '"' +
(marcados.indexOf(String(t.id)) > -1 ? " checked" : "") + '> ' + escapar(t.nombre) + '</label>').join("")
: (vivos.length
? '<p class="mini">Ninguno de tus temas se llama así. Créalo abajo.</p>'
: '<p class="mini">Todavía no has creado temas. Escribe el primero abajo.</p>');
pintarMarcados();
}

function pintarMarcados(){
const p = document.getElementById("c-marcados");
if (!p) return;
const nombres = marcados.map(id => { const t = temaPorId(id); return t ? t.nombre : ""; }).filter(Boolean);
p.innerHTML = nombres.length ? "Marcados: " + escapar(nombres.join(" · ")) : "";
}

/* Añadir guarda ya mismo y deja la ventana abierta */
async function anadir(){
const btn = document.getElementById("c-anadir");
const nuevos = String(leer("c-nuevos") || "").split(",").map(s => s.trim()).filter(Boolean);
if (!nuevos.length && !marcados.length){
avisar("Escribe el nombre del tema nuevo o marca alguno de la lista.", "mal", "#aviso-forma");
return;
}
if (btn){ btn.disabled = true; btn.textContent = "Guardando…"; }
try {
let finales = marcados.slice();
for (let i = 0; i < nuevos.length; i++){
const id = await idDeTema(nuevos[i]);
if (id) finales.push(String(id));
}
finales = unicos(finales);
await guardarTemas(ids, finales);
await cargarClasificacion();
marcados = finales;
pintarLista();
const inp = document.getElementById("c-nuevos");
if (inp){ inp.value = ""; inp.focus(); }
avisar("Guardado en " + plural(finales.length, "tema", "temas") +
" · sigue poniéndole los que quieras y al final dale Guardar y cerrar.", "", "#aviso-forma");
if (op.recargar) await op.recargar();
} catch (err){
avisar(traducirError(err && err.message), "mal", "#aviso-forma");
} finally {
if (btn){ btn.disabled = false; btn.textContent = "Añadir"; }
}
}

abrirVentana({
titulo: "Clasificar",
guia: plural(ids.length, "petición", "peticiones"),
cuerpo: cuerpo,
aceptar: "Guardar y cerrar",
ancha: true,
alAceptar: async () => {
const limpiar = marcado("c-limpiar");
let finales = [];
if (!limpiar){
finales = marcados.slice();
const nuevos = String(leer("c-nuevos") || "").split(",").map(s => s.trim()).filter(Boolean);
for (let i = 0; i < nuevos.length; i++){
const id = await idDeTema(nuevos[i]);
if (id) finales.push(String(id));
}
finales = unicos(finales);
if (!finales.length){
avisar("Elige un tema, escribe uno nuevo, o marca la casilla de dejar sin clasificar.", "mal", "#aviso-forma");
return false;
}
}
await guardarTemas(ids, finales);
avisar(limpiar
? plural(ids.length, "petición devuelta", "peticiones devueltas") + " a la bandeja."
: "Listo · " + plural(ids.length, "petición clasificada", "peticiones clasificadas"),
"", "#aviso-panel");
await cargarClasificacion();
if (op.recargar) await op.recargar();
}
});

pintarLista();

const caja = document.getElementById("c-lista");
if (caja) caja.addEventListener("change", e => {
const cb = e.target && e.target.closest ? e.target.closest(".c-tema") : null;
if (!cb) return;
const v = String(cb.value);
if (cb.checked){ if (marcados.indexOf(v) < 0) marcados.push(v); }
else marcados = marcados.filter(x => x !== v);
pintarMarcados();
});

const buscador = document.getElementById("c-buscar");
if (buscador) buscador.addEventListener("input", () => { filtro = buscador.value || ""; pintarLista(); });

const btnAdd = document.getElementById("c-anadir");
if (btnAdd) btnAdd.onclick = anadir;

const campo = document.getElementById("c-nuevos");
if (campo) campo.addEventListener("keydown", e => {
if (e.key === "Enter"){ e.preventDefault(); anadir(); }
});
}

/* El texto tal cual lo escribió el médico, para irlo leyendo
mientras se clasifica. Aquí nunca se edita: solo se muestra. */
function tarjetaLectura(x){
return '<article class="comentario" style="margin:0 0 8px">' +
'<div class="comentario-meta">' +
'<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
(x.estrellas != null ? '<span class="nota">' + x.estrellas + ' ★</span>' : '') +
'</div>' +
'<p>' + escapar(x.tema) + '</p>' +
(x.referencias ? '<p class="mini">Referencias que pide: ' + escapar(x.referencias) + '</p>' : '') +
(x.comentario ? '<p class="mini">También comentó: ' + escapar(x.comentario) + '</p>' : '') +
'</article>';
}

/* Reemplaza los temas de esas peticiones por los elegidos */
async function guardarTemas(ids, temaIds){
  const usuario = estado.usuario && estado.usuario.id;
  const d = await sb.from("tema_peticion").delete().in("feedback_id", ids);
  if (d.error) throw d.error;
  if (!temaIds.length) return;
  const filas = [];
  ids.forEach(i => temaIds.forEach(t => filas.push({ feedback_id:i, tema_id:t, creado_por:usuario })));
  const ins = await sb.from("tema_peticion").insert(filas);
  if (ins.error) throw ins.error;
}

/* Descartar: sale de la bandeja y del ranking, sin borrar el dato
   y sin necesidad de ponerle un tema */
export async function descartarPeticiones(ids, recargar){
  if (!ids || !ids.length) return;
  if (!clasif.descartado){
    const r = await sb.from("tema_canonico").insert({ nombre:"No es un tema", descartado:true })
      .select("id,nombre,descartado").single();
    if (r.error){ avisar("No se pudo descartar. " + r.error.message, "mal", "#aviso-panel"); return; }
    clasif.temas.push(r.data);
    clasif.descartado = r.data;
  }
  try { await guardarTemas(unicos(ids), [clasif.descartado.id]); }
  catch (err){ avisar("No se pudo descartar. " + (err && err.message), "mal", "#aviso-panel"); return; }
  avisar(plural(unicos(ids).length, "petición descartada", "peticiones descartadas") +
    " · sigue guardada en Supabase, solo sale de la bandeja.", "", "#aviso-panel");
  await cargarClasificacion();
  if (recargar) await recargar();
}

/* Saca una petición de un tema concreto. Si se queda sin temas,
   vuelve sola a la bandeja. */
export async function quitarDeTema(ids, temaId, recargar){
  const d = await sb.from("tema_peticion").delete().in("feedback_id", ids).eq("tema_id", temaId);
  if (d.error){ avisar("No se pudo quitar del tema. " + d.error.message, "mal", "#aviso-panel"); return; }
  avisar("Petición sacada del tema.", "", "#aviso-panel");
  await cargarClasificacion();
  if (recargar) await recargar();
}

/* ============================================================
   3. Ver los comentarios reales de un tema
   Es la lupa del ranking: aquí se lee tal cual lo que escribió
   cada médico y se corrige la clasificación si hace falta.
   ============================================================ */
export function ventanaVerTema(tema, peticiones, recargar){
  const lista = (peticiones || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const cuerpo =
    '<p class="mini">Lo que escribió cada médico, tal cual llegó. Puedes mandar cualquiera a otros ' +
    'temas o sacarla de este.</p>' +
    '<div id="ver-lista" style="max-height:58vh;overflow:auto">' +
    (lista.length ? lista.map(x => tarjetaVer(x, tema)).join("") : '<p class="vacio">Sin peticiones.</p>') +
    '</div>';

  abrirVentana({
    titulo: tema.nombre,
    guia: plural(lista.length, "petición", "peticiones") + " · " +
      plural(formasDe(lista), "forma de decirlo", "formas de decirlo"),
    cuerpo: cuerpo,
    aceptar: "Cerrar",
    ancha: true,
    alAceptar: async () => {}
  });

  const caja = document.getElementById("ver-lista");
  if (!caja) return;
  caja.addEventListener("click", e => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const x = lista.filter(p => String(p.id) === b.dataset.id)[0];
    if (!x) return;
    if (b.dataset.accion === "reclasificar"){
      ventanaClasificar({ peticiones:[x], ids:[x.id], actuales:temaIdsDe(x), recargar:recargar });
      return;
    }
    if (b.dataset.accion === "quitar") quitarDeTema([x.id], tema.id, recargar);
  });
}

export function formasDe(lista){
  return unicos((lista || []).map(x => x.tema_clave)).length;
}

function tarjetaVer(x, tema){
  const otros = nombresDe(x).filter(n => n !== tema.nombre);
  return '<article class="comentario" style="margin-bottom:10px">' +
    '<div class="comentario-meta">' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    (x.estrellas != null ? '<span class="nota">' + x.estrellas + ' ★</span>' : '') +
    '</div>' +
    '<p>' + escapar(x.tema) + '</p>' +
    (x.referencias ? '<p class="mini">Referencias que pide: ' + escapar(x.referencias) + '</p>' : '') +
    (x.comentario ? '<p class="mini">También comentó: ' + escapar(x.comentario) + '</p>' : '') +
    (otros.length ? '<p class="mini">También cuenta en: ' +
      otros.map(n => '<span class="etq">' + escapar(n) + '</span>').join(" ") + '</p>' : '') +
    '<div class="fila-entre">' +
    '<button class="boton-chico" data-accion="reclasificar" data-id="' + escapar(String(x.id)) + '">Reclasificar</button>' +
    '<button class="boton-chico" data-accion="quitar" data-id="' + escapar(String(x.id)) + '">Quitar de este tema</button>' +
    '</div></article>';
}

/* ============================================================
   4. Renombrar un tema
   El nombre se guarda en public.tema_canonico, así que el cambio
   se ve en todo el panel y queda en Supabase.
   ============================================================ */
export function ventanaRenombrar(tema, recargar){
  const cuerpo =
    '<span class="etiqueta">Nombre del tema</span>' +
    '<input class="campo" id="r-nombre" value="' + escapar(tema.nombre) + '">' +
    '<p class="mini">Se guarda en Supabase (tabla tema_canonico) y se actualiza en todo el panel. ' +
    'Las peticiones que ya están dentro no se mueven.</p>';

  abrirVentana({
    titulo: "Renombrar tema",
    guia: tema.nombre,
    cuerpo: cuerpo,
    aceptar: "Guardar",
    alAceptar: async () => {
      const nombre = leer("r-nombre");
      if (!nombre){ avisar("Ponle un nombre al tema.", "mal", "#aviso-forma"); return false; }
      const r = await sb.from("tema_canonico").update({ nombre: nombre }).eq("id", tema.id);
      if (r.error) throw r.error;
      avisar("Tema renombrado a “" + nombre + "”.", "", "#aviso-panel");
      await cargarClasificacion();
      if (recargar) await recargar();
    }
  });
}

/* ============================================================
   5. Borrar un tema
   Nunca se pierde una petición: primero se decide a dónde van,
   a un tema que ya existe o a uno nuevo, y después se borra el
   tema vacío.
   ============================================================ */
export function ventanaBorrarTema(tema, ids, recargar){
  const otros = temasVivos().filter(t => t.id !== tema.id);
  const cuantas = (ids || []).length;

  const cuerpo = cuantas
    ? '<p class="mini"><b>¿Seguro que quieres borrar este tema?</b> Este tema tiene ' + plural(cuantas, "petición", "peticiones") +
      '. Antes de borrarlo hay que decidir a dónde se mueven: no se pierde ninguna.</p>' +
      '<span class="etiqueta">Mover las peticiones a</span>' +
      '<select class="campo" id="b-destino">' +
      '<option value="">Crear un tema nuevo</option>' +
      otros.map(t => '<option value="' + t.id + '">' + escapar(t.nombre) + '</option>').join("") +
      '</select>' +
      '<input class="campo" id="b-nuevo" placeholder="Nombre del tema nuevo">' +
      '<p class="mini">Si eliges un tema de la lista, deja el campo de abajo vacío.</p>'
    : '<p class="mini"><b>¿Seguro que quieres borrar este tema?</b> No tiene peticiones, ' +
      'así que se puede borrar sin mover nada.</p>';

  abrirVentana({
    titulo: "Borrar tema",
    guia: tema.nombre,
    cuerpo: cuerpo,
    aceptar: cuantas ? "Sí, mover y borrar" : "Sí, borrar el tema",
    alAceptar: async () => {
      if (cuantas){
        let destino = leer("b-destino");
        if (!destino){
          const nombre = leer("b-nuevo");
          if (!nombre){ avisar("Elige un tema de la lista o escribe el nombre del tema nuevo.", "mal", "#aviso-forma"); return false; }
          destino = await idDeTema(nombre);
        }
        if (destino === tema.id){ avisar("Elige un tema distinto al que vas a borrar.", "mal", "#aviso-forma"); return false; }
        const mover = await sb.from("tema_peticion").upsert(
          unicos(ids).map(i => ({ feedback_id:i, tema_id:destino, creado_por:estado.usuario && estado.usuario.id })),
          { onConflict:"feedback_id,tema_id", ignoreDuplicates:true });
        if (mover.error) throw mover.error;
      }
      const borrar = await sb.from("tema_canonico").delete().eq("id", tema.id);
      if (borrar.error) throw borrar.error;
      avisar("Tema borrado" + (cuantas ? " · sus peticiones se movieron al tema que elegiste." : "."), "", "#aviso-panel");
      await cargarClasificacion();
      if (recargar) await recargar();
    }
  });
}

/* ============================================================
   6. Ayudas
   ============================================================ */
const PAISES = { CO:"Colombia", MX:"México", PE:"Perú", ES:"España", CL:"Chile", EC:"Ecuador",
  PA:"Panamá", US:"Estados Unidos", AR:"Argentina", BO:"Bolivia", BR:"Brasil", CR:"Costa Rica",
  DO:"República Dominicana", GT:"Guatemala", HN:"Honduras", NI:"Nicaragua", PY:"Paraguay",
  SV:"El Salvador", UY:"Uruguay", VE:"Venezuela" };

function nombrePais(c){
  const k = String(c || "").toUpperCase();
  return PAISES[k] || k;
}

function marcado(id){
  const e = document.getElementById(id);
  return !!(e && e.checked);
}

/* Reusa el tema si ya existe con ese nombre, sin importar mayúsculas */
async function idDeTema(nombre){
  const ya = clasif.temas.filter(t => String(t.nombre).trim().toLowerCase() === nombre.toLowerCase())[0];
  if (ya) return ya.id;
  const r = await sb.from("tema_canonico")
    .insert({ nombre: nombre, creado_por: estado.usuario && estado.usuario.id })
    .select("id,nombre,descartado").single();
  if (r.error) throw r.error;
  clasif.temas.push(r.data);
  return r.data.id;
}
