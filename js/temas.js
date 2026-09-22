/* ============================================================
   CLINICAL HUB · PESTAÑA TEMAS PEDIDOS
   Demanda de contenido: qué guías están pidiendo los médicos.

   Cómo funciona, de arriba a abajo:
     1. n8n guarda en Supabase el texto tal cual lo escribió el
        médico. El panel lo lee de public.v_temas_pedidos y no lo
        modifica nunca.
     2. Todo lo que no tiene tema cae en la BANDEJA. Ahí se
        clasifica a mano, de una en una o varias juntas, y lo que
        no es un tema se descarta.
     3. El RANKING muestra solo los temas que tú creaste, con
        cuántas peticiones agrupa cada uno. Ahí se crea o enlaza
        la mejora, se renombra el tema y se borra.
     4. El botón Ver de cada tema abre los comentarios reales y
        permite reclasificarlos.
   ============================================================ */
import { sb, $, escapar, fecha, num, pct } from "./nucleo.js";
import { ventanaMejoraTema } from "./temas-triage.js";
import { cargarClasificacion, ventanaClasificar, ventanaVerTema, ventanaRenombrar,
         ventanaBorrarTema, descartarPeticiones, temaIdsDe, temaPorId, temasVivos,
         esDescartada, nombresDe } from "./temas-clasificar.js";

let filas = [];
let descartadas = 0;
let cubiertos = new Set();
let gruposActuales = [];
let seleccion = new Set();
let verTodos = false;
const f = { dias:90, foco:"todas", pais:"", texto:"" };

const RANGOS = [["7","1 semana"], ["30","1 mes"], ["90","90 días"], ["365","12 meses"], ["0","Histórico"]];
const FOCOS = [["todas","Todos"], ["sin_accion","Sin mejora"], ["con_accion","Ya con mejora"]];

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

    <div class="filtros-fila">
      <span class="rotulo">Periodo</span>
      <div class="filtros" id="f-rango" role="group" aria-label="Periodo"></div>
    </div>
    <div class="filtros-fila">
      <span class="rotulo">Filtros</span>
      <div class="filtros" id="f-foco" role="group" aria-label="Estado de mejora"></div>
      <select class="campo compacto" id="f-pais" aria-label="País"></select>
      <input class="campo compacto buscador" id="f-texto" type="search" placeholder="Buscar en los textos o en tus temas…">
    </div>

    <div class="activos" id="activos" hidden></div>

    <p class="aviso" id="aviso-panel" role="status"></p>

    <div class="tarjetas" id="kpis"></div>

    <section class="caja" id="caja-bandeja">
      <div class="fila-entre">
        <span class="etiqueta">Bandeja · nuevos por clasificar</span>
        <span class="mini" id="cuenta-bandeja"></span>
      </div>
      <p class="mini">Cada petición llega tal cual la escribió el médico. Mándala a uno o varios de tus
        temas, o descártala si no es un tema. En cuanto la clasificas desaparece de la bandeja y empieza
        a sumar en el ranking.</p>
      <div id="barra-bandeja"></div>
      <div id="bandeja"><p class="vacio">Cargando…</p></div>
    </section>

    <section class="caja">
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
  `;
}

/* ============================================================
   2. Filtros y eventos
   ============================================================ */
function conectar(){
  pintarChips();
  $("#f-rango").addEventListener("click", e => elegir(e, "dias"));
  $("#f-foco").addEventListener("click", e => elegir(e, "foco"));
  $("#f-pais").addEventListener("change", e => { f.pais = e.target.value; pintar(); });
  $("#f-texto").addEventListener("input", e => { f.texto = e.target.value.trim().toLowerCase(); pintar(); });
  $("#btn-recargar").addEventListener("click", () => cargar());

  $("#caja-bandeja").addEventListener("click", e => {
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
      Array.prototype.forEach.call(document.querySelectorAll("#bandeja input[data-sel-pend]"), i => { i.checked = false; });
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
    if (e.target.closest("#btn-ver-todos")){ verTodos = !verTodos; pintar(); return; }
    const ver = e.target.closest("button[data-ver]");
    if (ver){ abrirTema(ver.dataset.ver); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    if (bt) accionDeTema(bt);
  });

  $("#activos").addEventListener("click", e => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    quitarFiltro(b.dataset.quitar);
  });
}

function elegir(e, campo){
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  f[campo] = campo === "dias" ? Number(b.dataset.v) : b.dataset.v;
  pintarChips();
  pintar();
}

function pintarChips(){
  fila("#f-rango", RANGOS, String(f.dias));
  fila("#f-foco", FOCOS, f.foco);
}

function fila(donde, lista, activo){
  $(donde).innerHTML = lista.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (String(par[0]) === String(activo)) + '">' +
    escapar(par[1]) + '</button>').join("");
}

function pintarPaises(){
  const sel = $("#f-pais");
  if (!sel) return;
  const cuenta = new Map();
  filas.forEach(x => { if (x.pais) cuenta.set(x.pais, (cuenta.get(x.pais) || 0) + 1); });
  const lista = Array.from(cuenta.entries()).sort((a, b) => b[1] - a[1]);
  sel.innerHTML = '<option value="">Todos los países</option>' +
    lista.map(p => '<option value="' + escapar(p[0]) + '">' + escapar(nombrePais(p[0])) + ' · ' + p[1] + '</option>').join("");
  sel.value = f.pais;
}

/* ============================================================
   3. Datos
   Una petición pertenece solo a los temas que alguien le puso a
   mano. Sin tema = está en la bandeja. Un tema se considera
   cubierto si cualquiera de sus peticiones ya está enlazada a
   una mejora.
   ============================================================ */
async function cargar(){
  const { data, error } = await sb.from("v_temas_pedidos").select("*").order("fecha", { ascending:false });
  if (error){
    $("#bandeja").innerHTML = '<p class="vacio">No se pudieron leer las peticiones. ' + escapar(error.message) + '</p>';
    return;
  }
  await cargarClasificacion();
  const todas = data || [];
  filas = todas.filter(x => !esDescartada(x));
  descartadas = todas.length - filas.length;
  seleccion = new Set();
  recalcularCubiertos();
  pintarPaises();
  pintar();
}

function recalcularCubiertos(){
  cubiertos = new Set();
  filas.forEach(x => { if (x.accionado) temaIdsDe(x).forEach(id => cubiertos.add(id)); });
}

function conMejora(x){
  if (x.accionado) return true;
  return temaIdsDe(x).some(id => cubiertos.has(id));
}

function peticionesDelTema(temaId){
  return filas.filter(x => temaIdsDe(x).indexOf(temaId) > -1);
}

function desdeHasta(atras){
  const hasta = Date.now() - (atras || 0) * (f.dias * 86400000);
  const desde = f.dias ? hasta - f.dias * 86400000 : 0;
  return [desde, hasta];
}

function base(atras){
  const par = desdeHasta(atras);
  return filas.filter(x => {
    const t = new Date(x.fecha).getTime();
    if (par[0] && t < par[0]) return false;
    if (atras && t >= par[1]) return false;
    return true;
  });
}

function filtradas(){
  return base(0).filter(x => {
    if (f.pais && x.pais !== f.pais) return false;
    if (f.foco === "sin_accion" && conMejora(x)) return false;
    if (f.foco === "con_accion" && !conMejora(x)) return false;
    if (f.texto){
      const saco = [x.tema, x.referencias, x.comentario, x.pais]
        .concat(nombresDe(x)).join(" ").toLowerCase();
      if (saco.indexOf(f.texto) === -1) return false;
    }
    return true;
  });
}

function pendientes(lista){
  return lista.filter(x => !temaIdsDe(x).length);
}

/* ============================================================
   4. Acciones
   ============================================================ */
function clasificarSeleccion(){
  const ids = Array.from(seleccion);
  if (!ids.length) return;
  const primera = filas.filter(p => String(p.id) === ids[0])[0];
  ventanaClasificar({
    nombre: ids.length === 1 && primera ? primera.tema : ids.length + " peticiones de la bandeja",
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
  if (bt.dataset.temaAccion === "renombrar"){ ventanaRenombrar(tema, cargar); return; }
  if (bt.dataset.temaAccion === "borrar"){ ventanaBorrarTema(tema, ids, cargar); return; }
}

/* ============================================================
   5. Pintado
   ============================================================ */
function pintar(){
  const lista = filtradas();
  pintarKpis(lista);
  pintarBandeja(lista);
  pintarRanking(lista);
  pintarTendencia(lista);
  pintarMapaPaises(lista);
  pintarActivos();
}

function tarjeta(cifra, etiqueta, extra, lima){
  return '<div class="dato"><div class="cifra tabular' + (lima ? " lima" : "") + '">' + cifra + '</div>' +
    '<span class="etiqueta">' + escapar(etiqueta) + '</span>' +
    (extra ? '<span class="mini">' + extra + '</span>' : '') + '</div>';
}

/* Agrupa las peticiones por los temas que tú creaste */
function agrupar(lista){
  const mapa = new Map();
  lista.forEach(x => {
    temaIdsDe(x).forEach(id => {
      const t = temaPorId(id);
      if (!t || t.descartado) return;
      const o = mapa.get(id) || { id:id, nombre:t.nombre, n:0, paises:new Set(),
        refs:new Set(), claves:new Set(), accionados:0 };
      o.n++;
      o.claves.add(x.tema_clave);
      if (x.pais) o.paises.add(x.pais);
      if (x.referencias) o.refs.add(x.referencias);
      if (conMejora(x)) o.accionados++;
      mapa.set(id, o);
    });
  });
  return Array.from(mapa.values()).sort((a, b) => (b.n - a.n) || a.nombre.localeCompare(b.nombre));
}

function pintarKpis(lista){
  const grupos = agrupar(lista);
  const porClasificar = pendientes(lista).length;
  let delta = "";
  const d = lista.length - base(1).length;
  const signo = d >= 0 ? "▲" : "▼";
  delta = '<span class="delta ' + (d >= 0 ? "sube" : "baja") + '">' + signo + " " + Math.abs(d) + " vs. periodo anterior</span>";
  const top = grupos[0];
  const conAccion = lista.filter(conMejora).length;

  $("#kpis").innerHTML =
    tarjeta(num(lista.length), "Peticiones", delta, true) +
    tarjeta(num(porClasificar), "Por clasificar", lista.length
      ? pct(porClasificar, lista.length) + "% de las peticiones" : "sin datos") +
    tarjeta(num(temasVivos().length), "Temas creados", grupos.length
      ? num(grupos.length) + " con peticiones en este periodo" : "ninguno con peticiones aquí") +
    tarjeta(top ? num(top.n) : "—", "Tema más pedido", top ? escapar(corto(top.nombre, 42)) : "sin datos") +
    tarjeta(pct(conAccion, lista.length) + "%", "Ya con mejora", num(conAccion) + " de " + num(lista.length));
}

/* ============================================================
   6. Bandeja de nuevos por clasificar
   ============================================================ */
function pintarBandeja(lista){
  const pend = pendientes(lista).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const caja = $("#cuenta-bandeja");
  if (caja) caja.textContent = pend.length
    ? pend.length + (pend.length === 1 ? " petición esperando tema" : " peticiones esperando tema") +
      (descartadas ? " · " + descartadas + " descartadas" : "")
    : "todo clasificado" + (descartadas ? " · " + descartadas + " descartadas" : "");

  if (!pend.length){
    $("#bandeja").innerHTML = '<p class="vacio">Bandeja vacía: no queda ninguna petición sin tema en este periodo.</p>';
    pintarBarraBandeja();
    return;
  }
  $("#bandeja").innerHTML = pend.slice(0, 200).map(tarjetaPendiente).join("");
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
    '<div class="fila-entre">' +
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
    ? '<div class="fila-entre" style="margin-bottom:10px">' +
      '<span class="mini"><b>' + n + '</b> ' + (n === 1 ? "petición elegida" : "peticiones elegidas") +
      ' · van juntas al mismo tema</span>' +
      '<span><button class="boton-chico" id="btn-clas-sel">Clasificar juntas</button> ' +
      '<button class="boton-chico" id="btn-desc-sel">Descartar</button> ' +
      '<button class="boton-chico" id="btn-sel-nada">Quitar selección</button></span></div>'
    : '';
}

/* ============================================================
   7. Ranking de tus temas
   ============================================================ */
function pintarRanking(lista){
  const grupos = agrupar(lista);
  gruposActuales = grupos;
  if (!grupos.length){
    $("#ranking").innerHTML = '<p class="vacio">Todavía no hay temas con peticiones en este periodo. ' +
      'Clasifica algo desde la bandeja de arriba y aparecerá aquí.</p>';
    return;
  }
  const TOPE = 10;
  const visibles = verTodos ? grupos : grupos.slice(0, TOPE);
  const ocultos = grupos.length - visibles.length;

  const cuerpo = visibles.map(o => {
    const cubierto = cubiertos.has(o.id);
    const marca = cubierto
      ? '<span class="etq lima">con mejora</span>'
      : (o.n > 1 ? '<span class="etq alerta">sin tocar</span>' : '<span class="mini">sin tocar</span>');
    const refs = Array.from(o.refs).join(" / ");
    const formas = o.claves.size;
    const lupa = '<span class="mini">' +
      (formas > 1 ? formas + " formas de decirlo" : (o.n > 1 ? o.n + " comentarios" : "1 comentario")) +
      '</span> <button class="boton-chico" data-ver="' + escapar(o.id) + '">Ver</button>';
    const botones =
      '<button class="boton-chico" data-tema-accion="mejora" data-clave="' + escapar(o.id) + '">' +
        (cubierto ? "Enlazar mejora" : "Crear mejora") + '</button>' +
      '<button class="boton-chico" data-tema-accion="renombrar" data-clave="' + escapar(o.id) + '">Renombrar</button>' +
      '<button class="boton-chico" data-tema-accion="borrar" data-clave="' + escapar(o.id) + '">Borrar</button>';
    return '<tr>' +
      '<td>' + escapar(corto(o.nombre, 60)) + '<br>' + lupa + '</td>' +
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
    '<th>Referencias que piden</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
    cuerpo + '</tbody></table>' + alterna +
    '<p class="mini">Solo aparecen los temas que tú creaste' +
    (ocultos > 0 ? ' · se muestran los ' + TOPE + ' más pedidos de ' + grupos.length : '') +
    '. “Ver” abre los comentarios reales de ese tema y desde ahí puedes reclasificar cualquiera. ' +
    'La mejora se enlaza a todas las peticiones del tema. Las referencias son las guías que el médico ' +
    'quiere que se citen, no son temas aparte.</p>';
}

function pintarTendencia(lista){
  const mapa = new Map();
  lista.forEach(x => {
    const m = String(x.dia || x.fecha).slice(0, 7);
    mapa.set(m, (mapa.get(m) || 0) + 1);
  });
  const meses = Array.from(mapa.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-12);
  if (!meses.length){ $("#tendencia").innerHTML = '<p class="vacio">Sin datos en este periodo.</p>'; return; }
  const tope = Math.max.apply(null, meses.map(m => m[1]));
  $("#tendencia").innerHTML = meses.map(m =>
    '<div class="fila">' +
    '<span class="fila-etq">' + etqMes(m[0]) + '</span>' +
    '<span class="barra"><span style="width:' + (m[1] / tope * 100) + '%;background:var(--brand)"></span></span>' +
    '<span class="fila-num tabular"><b>' + m[1] + '</b></span>' +
    '</div>').join("") +
    '<p class="mini">Peticiones recibidas por mes. Si sube, hay hueco de contenido.</p>';
}

function pintarMapaPaises(lista){
  const mapa = new Map();
  lista.forEach(x => { if (x.pais) mapa.set(x.pais, (mapa.get(x.pais) || 0) + 1); });
  const top = Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length){ $("#mapa-paises").innerHTML = '<p class="vacio">Sin datos de país en este periodo.</p>'; return; }
  const tope = top[0][1];
  $("#mapa-paises").innerHTML = top.map(v =>
    '<div class="fila">' +
    '<span class="fila-etq">' + escapar(nombrePais(v[0])) + '</span>' +
    '<span class="barra"><span style="width:' + (v[1] / tope * 100) + '%;background:var(--brand)"></span></span>' +
    '<span class="fila-num tabular"><b>' + v[1] + '</b> · ' + pct(v[1], lista.length) + '%</span>' +
    '</div>').join("") +
    '<p class="mini">Dónde está la demanda. Sirve para priorizar guías por país.</p>';
}

/* ============================================================
   8. Barra de filtros activos
   ============================================================ */
function rotuloDe(lista, v){
  const par = lista.find(x => String(x[0]) === String(v));
  return par ? par[1] : String(v);
}

function pintarActivos(){
  const caja = $("#activos");
  if (!caja) return;
  const selPais = $("#f-pais");
  if (selPais) selPais.classList.toggle("filtrando", !!f.pais);
  const out = [];
  if (f.foco !== "todas") out.push({ campo:"foco", txt:rotuloDe(FOCOS, f.foco) });
  if (f.pais) out.push({ campo:"pais", txt:"País: " + nombrePais(f.pais) });
  if (f.texto) out.push({ campo:"texto", txt:"Busca: " + f.texto });
  caja.hidden = !out.length;
  if (!out.length){ caja.innerHTML = ""; return; }
  caja.innerHTML = '<span class="rotulo">Filtrando por</span>' +
    out.map(x => '<button class="ficha" title="Quitar este filtro" data-quitar="' + x.campo + '">' +
      escapar(x.txt) + '<span aria-hidden="true">×</span></button>').join("") +
    '<button class="ficha limpiar" data-quitar="todo">Quitar filtros</button>';
}

function quitarFiltro(campo){
  if (campo === "todo"){
    f.foco = "todas"; f.pais = ""; f.texto = "";
    $("#f-pais").value = "";
    $("#f-texto").value = "";
    pintarChips();
  }
  else if (campo === "pais"){ f.pais = ""; $("#f-pais").value = ""; }
  else if (campo === "texto"){ f.texto = ""; $("#f-texto").value = ""; }
  else if (campo === "foco"){ f.foco = "todas"; pintarChips(); }
  pintar();
}

/* ============================================================
   9. Ayudas de presentación
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
