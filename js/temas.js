/* ============================================================
   CLINICAL HUB · PESTAÑA TEMAS PEDIDOS
   Demanda de contenido: qué guías están pidiendo los médicos.

   La pestaña tiene dos subpestañas del mismo peso:

   INBOX    Todo lo que todavía no tiene tema. Histórico completo,
            sin filtros: solo clasificar o descartar. El globito de
            la subpestaña dice cuántas faltan, como los mensajes
            sin leer del teléfono.
   RANKING  El reflejo de todo lo ya clasificado, también histórico.
            Tus temas ordenados por cuánta gente los pide. Desde
            aquí se crea o enlaza la mejora, se renombra y se borra
            un tema. Un único filtro: con mejora / sin mejora.

   El texto del médico no se toca nunca: n8n lo guarda tal cual en
   Supabase y el panel solo lo lee de public.v_temas_pedidos. La
   clasificación vive aparte, en tema_canonico y tema_peticion.
============================================================ */
import { sb, $, escapar, fecha, num, pct } from "./nucleo.js";
import { ventanaMejoraTema } from "./temas-triage.js";
import { cargarClasificacion, ventanaClasificar, ventanaVerTema, ventanaRenombrar,
         ventanaBorrarTema, descartarPeticiones, temaIdsDe, temaPorId, temasVivos,
         esDescartada } from "./temas-clasificar.js";

let filas = [];
let descartadas = 0;
let cubiertos = new Set();
let enlaces = new Map();   // peticion -> mejora a la que esta enlazada
let mejoraDe = new Map();  // tema -> mejora del tema
let seleccion = new Set();
let verTodos = false;
let vista = "ranking";
const f = { foco:"todas" };

const FOCOS = [["todas","Todos"], ["sin_accion","Sin mejora"], ["con_accion","Con mejora"]];
const TOPE = 10;

/* Iconos del ranking: el lapiz renombra, la caneca borra */
const LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16v4z"/>' +
  '<path d="M13.5 6.5l4 4"/></svg>';
const CANECA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 4h4"/>' +
  '<path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

/* ============================================================
   1. Armazón de la pestaña
============================================================ */
export async function render(){
  $("#vista").innerHTML = armazon();
  conectar();
  await cargar();
}

function armazon(){
  return `
<div class="cabecera">
  <div>
    <div class="mast"><span class="etiqueta">Demanda de contenido</span><h1>Temas pedidos</h1></div>
    <p>Lo que pidieron los médicos, tal cual lo escribieron, clasificado en tus temas.</p>
  </div>
  <button class="boton-chico" id="btn-recargar">Actualizar</button>
</div>

<div class="subpestanas" id="subpestanas" role="tablist" aria-label="Secciones de temas pedidos">
  <button class="subpestana" role="tab" data-sub="inbox" id="sub-inbox"
          aria-selected="false" aria-controls="panel-inbox">Inbox
    <span class="globo" id="globo-inbox" hidden>0</span></button>
  <button class="subpestana" role="tab" data-sub="ranking" id="sub-ranking"
          aria-selected="true" aria-controls="panel-ranking">Ranking</button>
</div>

<section id="panel-inbox" role="tabpanel" aria-labelledby="sub-inbox" hidden>
  <p class="resumen-sub" id="resumen-inbox"></p>
  <section class="caja" style="margin-top:14px">
    <span class="etiqueta">Nuevos por clasificar</span>
    <p class="mini">Cada petición llega tal cual la escribió el médico. Mándala a uno o a varios
    de tus temas, o descártala si no es un tema. En cuanto la clasificas desaparece del inbox y
    empieza a sumar en el ranking. Aquí está todo el histórico: nada se pierde hasta que lo toques.</p>
    <div id="barra-bandeja"></div>
    <div id="bandeja"><p class="vacio">Cargando…</p></div>
  </section>
</section>

<section id="panel-ranking" role="tabpanel" aria-labelledby="sub-ranking" hidden>
  <p class="resumen-sub" id="resumen-ranking"></p>
  <div class="filtros-fila">
    <span class="rotulo">Mejora</span>
    <div class="filtros" id="f-foco" role="group" aria-label="Estado de mejora"></div>
  </div>
  <section class="caja" style="margin-top:14px">
    <div class="fila-entre">
      <span class="etiqueta">Ranking de temas</span>
      <span class="mini">Tus temas, ordenados por cuánta gente los pide</span>
    </div>
    <div id="ranking"></div>
  </section>
  <div class="rejilla">
    <section class="caja">
      <span class="etiqueta">Mes a mes</span><span class="mini">Cuántas peticiones entran cada mes</span>
      <div id="tendencia"></div>
    </section>
    <section class="caja">
      <span class="etiqueta">Por país</span><span class="mini">Desde dónde piden más</span>
      <div id="mapa-paises"></div>
    </section>
  </div>
</section>
`;
}

/* ============================================================
   2. Eventos
============================================================ */
function conectar(){
  pintarChips();
  $("#btn-recargar").addEventListener("click", () => cargar());

  $("#subpestanas").addEventListener("click", e => {
    const b = e.target.closest("button[data-sub]");
    if (!b || b.dataset.sub === vista) return;
    vista = b.dataset.sub;
    pintarSubpestanas();
  });

  $("#f-foco").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    f.foco = b.dataset.v;
    pintarChips();
    pintarRanking();
  });

  $("#panel-inbox").addEventListener("click", e => {
    const cb = e.target.closest("input[data-sel-pend]");
    if (cb){
      if (cb.checked) seleccion.add(cb.dataset.selPend); else seleccion.delete(cb.dataset.selPend);
      pintarBarraBandeja();
      return;
    }
    if (e.target.closest("#btn-clas-sel")){ clasificarSeleccion(); return; }
    if (e.target.closest("#btn-desc-sel")){ descartarSeleccion(); return; }
    if (e.target.closest("#btn-sel-nada")){
      seleccion = new Set();
      Array.prototype.forEach.call(document.querySelectorAll("#bandeja input[data-sel-pend]"),
        i => { i.checked = false; });
      pintarBarraBandeja();
      return;
    }
    const bt = e.target.closest("button[data-pend-accion]");
    if (!bt) return;
    const x = filas.filter(p => String(p.id) === bt.dataset.id)[0];
    if (!x) return;
    if (bt.dataset.pendAccion === "clasificar"){
      ventanaClasificar({ nombre:x.tema, ids:[x.id], actuales:temaIdsDe(x), recargar:cargar });
      return;
    }
    if (bt.dataset.pendAccion === "descartar") descartarPeticiones([x.id], cargar);
  });

  $("#ranking").addEventListener("click", e => {
    if (e.target.closest("#btn-ver-todos")){ verTodos = !verTodos; pintarRanking(); return; }
    const ver = e.target.closest("button[data-ver]");
    if (ver){ abrirTema(ver.dataset.ver); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    if (bt) accionDeTema(bt);
  });
}

function pintarChips(){
  $("#f-foco").innerHTML = FOCOS.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (par[0] === f.foco) + '">' +
    escapar(par[1]) + '</button>').join("");
}

function pintarSubpestanas(){
  const enInbox = vista === "inbox";
  $("#sub-inbox").setAttribute("aria-selected", String(enInbox));
  $("#sub-ranking").setAttribute("aria-selected", String(!enInbox));
  $("#panel-inbox").hidden = !enInbox;
  $("#panel-ranking").hidden = enInbox;
}

function pintarGlobo(n){
  const g = $("#globo-inbox");
  if (!g) return;
  g.hidden = !n;
  g.textContent = n > 99 ? "99+" : String(n);
}

/* ============================================================
   3. Datos
   Sin periodo y sin filtros de búsqueda: el panel es histórico.
   Una petición pertenece solo a los temas que tú le pusiste a
   mano. Sin tema = está en el inbox. Un tema se considera
   cubierto si cualquiera de sus peticiones ya tiene mejora.
============================================================ */
async function cargar(){
  const [v, af] = await Promise.all([
    sb.from("v_temas_pedidos").select("*").order("fecha", { ascending:false }),
    sb.from("accion_feedback").select("accion_id,feedback_id")
  ]);
  const data = v.data, error = v.error;
  enlaces = new Map();
  ((af && af.data) || []).forEach(r => {
    if (!enlaces.has(r.feedback_id)) enlaces.set(r.feedback_id, r.accion_id);
  });
  if (error){
    $("#bandeja").innerHTML = '<p class="vacio">No se pudieron leer las peticiones. ' +
      escapar(error.message) + '</p>';
    return;
  }
  await cargarClasificacion();
  const todas = data || [];
  filas = todas.filter(x => !esDescartada(x));
  descartadas = todas.length - filas.length;
  seleccion = new Set();
  recalcularCubiertos();
  pintar();
}

function recalcularCubiertos(){
  cubiertos = new Set();
  mejoraDe = new Map();
  filas.forEach(x => {
    const acc = enlaces.get(x.id);
    if (!x.accionado && !acc) return;
    temaIdsDe(x).forEach(id => {
      cubiertos.add(id);
      if (acc && !mejoraDe.has(id)) mejoraDe.set(id, acc);
    });
  });
}

function conMejora(x){
  if (x.accionado) return true;
  return temaIdsDe(x).some(id => cubiertos.has(id));
}

function pendientes(){
  return filas.filter(x => !temaIdsDe(x).length);
}

function clasificadas(){
  return filas.filter(x => temaIdsDe(x).length);
}

function peticionesDelTema(temaId){
  return filas.filter(x => temaIdsDe(x).indexOf(temaId) > -1);
}

/* Agrupa las peticiones por los temas que tú creaste */
function agrupar(){
  const mapa = new Map();
  filas.forEach(x => {
    temaIdsDe(x).forEach(id => {
      const t = temaPorId(id);
      if (!t || t.descartado) return;
      const o = mapa.get(id) || { id:id, nombre:t.nombre, n:0, paises:new Set(),
                                  refs:new Set(), claves:new Set() };
      o.n++;
      o.claves.add(x.tema_clave);
      if (x.pais) o.paises.add(x.pais);
      if (x.referencias) o.refs.add(x.referencias);
      mapa.set(id, o);
    });
  });
  return Array.from(mapa.values()).sort((a, b) => (b.n - a.n) || a.nombre.localeCompare(b.nombre));
}

/* ============================================================
   4. Acciones
============================================================ */
function clasificarSeleccion(){
  const ids = Array.from(seleccion);
  if (!ids.length) return;
  const primera = filas.filter(p => String(p.id) === ids[0])[0];
  ventanaClasificar({
    nombre: ids.length === 1 && primera ? primera.tema : ids.length + " peticiones del inbox",
    ids: ids,
    actuales: [],
    recargar: cargar
  });
}

function descartarSeleccion(){
  const ids = Array.from(seleccion);
  if (!ids.length) return;
  descartarPeticiones(ids, cargar);
}

function abrirTema(temaId){
  const tema = temaPorId(temaId);
  if (!tema) return;
  ventanaVerTema(tema, peticionesDelTema(temaId), cargar);
}

function accionDeTema(bt){
  const temaId = bt.dataset.clave;
  const tema = temaPorId(temaId);
  if (!tema) return;
  const ids = peticionesDelTema(temaId).map(x => x.id);
  if (bt.dataset.temaAccion === "mejora"){ ventanaMejoraTema(tema.nombre, ids, cargar); return; }
  if (bt.dataset.temaAccion === "vermejora"){ irAMejora(temaId, tema, ids); return; }
  if (bt.dataset.temaAccion === "renombrar"){ ventanaRenombrar(tema, cargar); return; }
  if (bt.dataset.temaAccion === "borrar"){ ventanaBorrarTema(tema, ids, cargar); return; }
}

/* Si el tema ya tiene mejora, el boton lleva a la pestana Mejoras y la
   resalta. Si por lo que sea no se encuentra, abre la ventana de crearla. */
function irAMejora(temaId, tema, ids){
  const accionId = mejoraDe.get(temaId);
  if (!accionId){ ventanaMejoraTema(tema.nombre, ids, cargar); return; }
  document.dispatchEvent(new CustomEvent("ch-ir", {
    detail: { seccion:"mejoras", foco: accionId }
  }));
}

function pintar(){
  pintarInbox();
  pintarRanking();
  pintarTendencia();
  pintarMapaPaises();
  pintarSubpestanas();
}

/* ============================================================
   5. Inbox
============================================================ */
function pintarInbox(){
  const pend = pendientes().slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  pintarGlobo(pend.length);

  const res = $("#resumen-inbox");
  if (res) res.innerHTML = (pend.length
    ? "<b>" + num(pend.length) + "</b> " +
      (pend.length === 1 ? "petición esperando tema" : "peticiones esperando tema")
    : "Todo clasificado: no queda ninguna petición sin tema") +
    " · <b>" + num(clasificadas().length) + "</b> ya clasificadas" +
    (descartadas ? " · " + num(descartadas) +
      (descartadas === 1 ? " descartada" : " descartadas") : "");

  if (!pend.length){
    $("#bandeja").innerHTML = '<p class="vacio">Inbox vacío: no queda ninguna petición sin tema.</p>';
    pintarBarraBandeja();
    return;
  }
  $("#bandeja").innerHTML = pend.map(tarjetaPendiente).join("");
  pintarBarraBandeja();
}

function tarjetaPendiente(x){
  const id = escapar(String(x.id));
  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
    '<label class="mini"><input type="checkbox" data-sel-pend="' + id + '"' +
    (seleccion.has(String(x.id)) ? " checked" : "") + '> elegir</label>' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    (x.estrellas != null ? '<span class="nota">' + x.estrellas + ' ★</span>' : '') +
    '</div>' +
    '<p>' + escapar(x.tema) + '</p>' +
    (x.referencias ? '<p class="mini">Referencias que pide: ' + escapar(x.referencias) + '</p>' : '') +
    (x.comentario ? '<p class="mini">También comentó: ' + escapar(x.comentario) + '</p>' : '') +
    '<div class="fila-entre" style="margin:11px 0 0">' +
    '<span class="mini">Sin tema todavía</span>' +
    '<span><button class="boton-chico" data-pend-accion="clasificar" data-id="' + id + '">Clasificar</button> ' +
    '<button class="boton-chico" data-pend-accion="descartar" data-id="' + id + '">Descartar</button></span>' +
    '</div></article>';
}

function pintarBarraBandeja(){
  const caja = $("#barra-bandeja");
  if (!caja) return;
  const n = seleccion.size;
  caja.innerHTML = n
    ? '<div class="fila-entre" style="margin:12px 0 10px">' +
      '<span class="mini"><b>' + n + '</b> ' + (n === 1 ? "petición elegida" : "peticiones elegidas") +
      ' · van juntas al mismo tema</span>' +
      '<span><button class="boton-chico" id="btn-clas-sel">Clasificar juntas</button> ' +
      '<button class="boton-chico" id="btn-desc-sel">Descartar</button> ' +
      '<button class="boton-chico" id="btn-sel-nada">Quitar selección</button></span></div>'
    : '';
}

/* ============================================================
   6. Ranking de tus temas
============================================================ */
function pintarRanking(){
  const todos = agrupar();
  pintarResumenRanking(todos);

  const grupos = todos.filter(o => {
    if (f.foco === "sin_accion") return !cubiertos.has(o.id);
    if (f.foco === "con_accion") return cubiertos.has(o.id);
    return true;
  });

  if (!todos.length){
    $("#ranking").innerHTML = '<p class="vacio">Todavía no has creado ningún tema. ' +
      'Clasifica algo desde el inbox y aparecerá aquí.</p>';
    return;
  }
  if (!grupos.length){
    $("#ranking").innerHTML = '<p class="vacio">Ningún tema cumple ese filtro. ' +
      'Prueba con Todos.</p>';
    return;
  }

  const visibles = verTodos ? grupos : grupos.slice(0, TOPE);
  const ocultos = grupos.length - visibles.length;

  const cuerpo = visibles.map(o => {
    const cubierto = cubiertos.has(o.id);
    const marca = cubierto
      ? '<span class="etq lima">con mejora</span>'
      : '<span class="etq alerta">sin mejora</span>';
    const refs = Array.from(o.refs).join(" / ");
    const formas = o.claves.size;
    const textoFormas = formas > 1 ? formas + " formas de decirlo"
      : (o.n > 1 ? o.n + " comentarios" : "1 comentario");
    const enlace = '<button class="enlace-formas" data-ver="' + escapar(o.id) +
      '" title="Ver los comentarios reales de este tema">' + textoFormas + '</button>';
    const iconos =
      '<button class="icono-btn" data-tema-accion="renombrar" data-clave="' + escapar(o.id) +
      '" title="Renombrar tema" aria-label="Renombrar tema">' + LAPIZ + '</button>' +
      '<button class="icono-btn peligro" data-tema-accion="borrar" data-clave="' + escapar(o.id) +
      '" title="Borrar tema" aria-label="Borrar tema">' + CANECA + '</button>';
    const botones = (cubierto && mejoraDe.get(o.id))
      ? '<button class="boton-chico" data-tema-accion="vermejora" data-clave="' + escapar(o.id) +
        '">Ver mejora</button>'
      : '<button class="boton-chico" data-tema-accion="mejora" data-clave="' + escapar(o.id) +
        '">Crear mejora</button>';
    return '<tr>' +
      '<td><span class="tema-nombre">' + escapar(corto(o.nombre, 60)) + iconos + '</span><br>' + enlace + '</td>' +
      '<td class="tabular"><b>' + o.n + '</b></td>' +
      '<td class="tabular">' + o.paises.size + '</td>' +
      '<td><span class="mini">' + (refs ? escapar(corto(refs, 44)) : "—") + '</span></td>' +
      '<td>' + marca + '</td>' +
      '<td>' + botones + '</td></tr>';
  }).join("");

  const alterna = (grupos.length > TOPE || verTodos)
    ? '<button class="boton-chico" id="btn-ver-todos">' +
      (verTodos ? "Ver solo los 10 más pedidos" : "Ver todos los temas (" + grupos.length + ")") + '</button>'
    : '';

  $("#ranking").innerHTML =
    '<table class="tabla"><thead><tr><th>Tema</th><th>Piden</th><th>Países</th>' +
    '<th>Referencias que piden</th><th>Mejora</th><th>Acciones</th></tr></thead><tbody>' +
    cuerpo + '</tbody></table>' + alterna +
    '<p class="mini">Solo aparecen los temas que tú creaste' +
    (ocultos > 0 ? ' · se muestran los ' + TOPE + ' más pedidos de ' + grupos.length : '') +
    '. El texto subrayado abre los comentarios reales de ese tema y desde ahí puedes ' +
    'reclasificar cualquiera. El lápiz renombra el tema y la caneca lo borra, moviendo antes ' +
    'sus peticiones a donde tú digas. ' +
    'La mejora se enlaza a todas las peticiones del tema. Las referencias son las guías que el médico ' +
    'quiere que se citen, no son temas aparte.</p>';
}

function pintarResumenRanking(todos){
  const res = $("#resumen-ranking");
  if (!res) return;
  const conMej = todos.filter(o => cubiertos.has(o.id)).length;
  const porc = todos.length ? pct(conMej, todos.length) : 0;
  res.innerHTML = "<b>" + num(temasVivos().length) + "</b> temas creados · <b>" +
    num(clasificadas().length) + "</b> peticiones clasificadas · <b>" + porc +
    "%</b> con mejora (" + num(conMej) + " de " + num(todos.length) + ")";
}

/* ============================================================
   7. Gráficas de apoyo (histórico completo)
============================================================ */
function pintarTendencia(){
  const mapa = new Map();
  filas.forEach(x => {
    const m = String(x.dia || x.fecha).slice(0, 7);
    mapa.set(m, (mapa.get(m) || 0) + 1);
  });
  const meses = Array.from(mapa.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-12);
  if (!meses.length){ $("#tendencia").innerHTML = '<p class="vacio">Sin datos.</p>'; return; }
  const tope = Math.max.apply(null, meses.map(m => m[1]));
  $("#tendencia").innerHTML = meses.map(m =>
    '<div class="fila">' +
    '<span class="fila-etq">' + etqMes(m[0]) + '</span>' +
    '<span class="barra"><span style="width:' + (m[1] / tope * 100) + '%;background:var(--brand)"></span></span>' +
    '<span class="fila-num tabular"><b>' + m[1] + '</b></span>' +
    '</div>').join("") +
    '<p class="mini">Peticiones recibidas por mes. Si sube, hay hueco de contenido.</p>';
}

function pintarMapaPaises(){
  const mapa = new Map();
  filas.forEach(x => { if (x.pais) mapa.set(x.pais, (mapa.get(x.pais) || 0) + 1); });
  const top = Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length){ $("#mapa-paises").innerHTML = '<p class="vacio">Sin datos de país.</p>'; return; }
  const tope = top[0][1];
  $("#mapa-paises").innerHTML = top.map(v =>
    '<div class="fila">' +
    '<span class="fila-etq">' + escapar(nombrePais(v[0])) + '</span>' +
    '<span class="barra"><span style="width:' + (v[1] / tope * 100) + '%;background:var(--brand)"></span></span>' +
    '<span class="fila-num tabular"><b>' + v[1] + '</b> · ' + pct(v[1], filas.length) + '%</span>' +
    '</div>').join("") +
    '<p class="mini">Dónde está la demanda. Sirve para priorizar guías por país.</p>';
}

/* ============================================================
   8. Ayudas de presentación
============================================================ */
const PAISES = { CO:"Colombia", MX:"México", PE:"Perú", ES:"España", CL:"Chile", EC:"Ecuador",
  PA:"Panamá", US:"Estados Unidos", AR:"Argentina", BO:"Bolivia", BR:"Brasil", CR:"Costa Rica",
  DO:"República Dominicana", GT:"Guatemala", HN:"Honduras", NI:"Nicaragua", PY:"Paraguay",
  SV:"El Salvador", UY:"Uruguay", VE:"Venezuela" };

function nombrePais(c){
  const k = String(c || "").toUpperCase();
  return PAISES[k] || k;
}

function corto(s, n){
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function etqMes(m){
  return String(m).slice(5) + "/" + String(m).slice(2, 4);
}
