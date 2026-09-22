/* ============================================================
   CLINICAL HUB · PESTAÑA TEMAS PEDIDOS
   Demanda de contenido: qué guías están pidiendo los médicos.
   Lee public.v_temas_pedidos, que reúne en una sola lista todas
   las peticiones de tema, sin importar desde dónde se escribieron.
   Se actúa siempre sobre el TEMA, desde el ranking: una mejora
   queda enlazada a todas las peticiones de ese tema. La lista de
   abajo es solo para leer qué dijo cada médico.
   ============================================================ */
import { sb, $, escapar, fecha, num, pct } from "./nucleo.js";
import { ventanaMejoraTema, revisarTema } from "./temas-triage.js";

let filas = [];
let cubiertos = new Set();
let verTodos = false;
const f = { dias:90, foco:"todas", pais:"", texto:"", tema:"", temaNombre:"" };

const RANGOS = [["7","1 semana"], ["30","1 mes"], ["90","90 días"], ["365","12 meses"], ["0","Histórico"]];
const FOCOS = [["todas","Todas"], ["sin_accion","Sin mejora"], ["con_accion","Ya con mejora"],
               ["sin_revisar","Sin revisar"]];

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
    <p>Qué guías están pidiendo los médicos, todo en una sola lista.</p>
  </div>
  <button class="boton-chico" id="btn-recargar">Actualizar</button>
</div>

<div class="filtros-fila">
  <span class="rotulo">Periodo</span>
  <div class="filtros" id="f-rango" role="group" aria-label="Periodo"></div>
</div>
<div class="filtros-fila">
  <span class="rotulo">Filtros</span>
  <div class="filtros" id="f-foco" role="group" aria-label="Foco"></div>
  <select class="campo compacto" id="f-pais" aria-label="País"></select>
  <input class="campo compacto buscador" id="f-texto" type="search" placeholder="Buscar un tema…">
</div>

<div class="activos" id="activos" hidden></div>

<p class="aviso" id="aviso-panel" role="status"></p>

<div class="tarjetas" id="kpis"></div>

<section class="caja">
  <div class="fila-entre">
    <span class="etiqueta">Ranking de temas</span>
    <span class="mini">Aquí se actúa: la mejora y el revisado se aplican al tema completo</span>
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

<section class="caja comentarios">
  <div class="fila-entre">
    <span class="etiqueta">Peticiones · una por una</span>
    <span class="mini" id="cuenta"></span>
  </div>
  <p class="mini">Solo lectura: lo que escribió cada médico, tal cual. Las acciones están arriba, en el ranking.</p>
  <div id="peticiones"><p class="vacio">Cargando…</p></div>
</section>
`;
}

/* ============================================================
   2. Filtros
   ============================================================ */
function conectar(){
  pintarChips();
  $("#f-rango").addEventListener("click", e => elegir(e, "dias"));
  $("#f-foco").addEventListener("click", e => elegir(e, "foco"));
  $("#f-pais").addEventListener("change", e => { f.pais = e.target.value; pintar(); });
  $("#f-texto").addEventListener("input", e => { f.texto = e.target.value.trim().toLowerCase(); pintar(); });
  $("#btn-recargar").addEventListener("click", () => cargar());
  $("#ranking").addEventListener("click", e => {
    if (e.target.closest("#btn-ver-todos")){ verTodos = !verTodos; pintar(); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    if (bt){ e.stopPropagation(); accionDeTema(bt); return; }
    const fila = e.target.closest("[data-tema]");
    if (!fila) return;
    f.tema = (f.tema === fila.dataset.tema) ? "" : fila.dataset.tema;
    f.temaNombre = f.tema ? (fila.dataset.nombre || fila.dataset.tema) : "";
    pintar();
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
   Un tema se considera cubierto si CUALQUIERA de sus peticiones
   ya está enlazada a una mejora. Así, si mañana entra una
   petición nueva del mismo tema, nace ya cubierta y no vuelve a
   aparecer como pendiente falsa.
   ============================================================ */
async function cargar(){
  const { data, error } = await sb.from("v_temas_pedidos").select("*").order("fecha", { ascending:false });
  if (error){
    $("#peticiones").innerHTML = '<p class="vacio">No se pudieron leer las peticiones. ' + escapar(error.message) + '</p>';
    return;
  }
  filas = data || [];
  recalcularCubiertos();
  pintarPaises();
  pintar();
}

function recalcularCubiertos(){
  cubiertos = new Set();
  filas.forEach(x => { if (x.accionado && x.tema_clave) cubiertos.add(x.tema_clave); });
}

function conMejora(x){
  return !!x.accionado || cubiertos.has(x.tema_clave);
}

function peticionesDelTema(clave){
  return filas.filter(x => x.tema_clave === clave);
}

function temaTodoRevisado(clave){
  const todas = peticionesDelTema(clave);
  return todas.length > 0 && todas.every(x => x.revisado);
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

function filtradas(omitir){
  return base(0).filter(x => {
    if (f.pais && x.pais !== f.pais) return false;
    if (omitir !== "tema" && f.tema && x.tema_clave !== f.tema) return false;
    if (f.foco === "sin_accion" && conMejora(x)) return false;
    if (f.foco === "con_accion" && !conMejora(x)) return false;
    if (f.foco === "sin_revisar" && x.revisado) return false;
    if (f.texto){
      const saco = [x.tema, x.referencias, x.comentario, x.pais].join(" ").toLowerCase();
      if (saco.indexOf(f.texto) === -1) return false;
    }
    return true;
  });
}

/* ============================================================
   4. Acciones sobre el tema (desde el ranking)
   ============================================================ */
function accionDeTema(bt){
  const clave = bt.dataset.clave;
  const delTema = peticionesDelTema(clave);
  const ids = delTema.map(x => x.id);
  if (!ids.length) return;
  if (bt.dataset.temaAccion === "mejora"){
    ventanaMejoraTema(bt.dataset.nombre || clave, ids, cargar);
    return;
  }
  revisarTema(ids, !delTema.every(x => x.revisado), bt, cargar);
}

/* ============================================================
   5. Pintado
   ============================================================ */
function pintar(){
  const lista = filtradas();
  pintarKpis(lista);
  pintarRanking(filtradas("tema"));
  pintarTendencia(lista);
  pintarMapaPaises(lista);
  pintarPeticiones(lista);
  pintarActivos();
}

function tarjeta(cifra, etiqueta, extra, lima){
  return '<div class="dato"><div class="cifra tabular' + (lima ? " lima" : "") + '">' + cifra + '</div>' +
    '<span class="etiqueta">' + escapar(etiqueta) + '</span>' +
    (extra ? '<span class="mini">' + extra + '</span>' : '') + '</div>';
}

/* Agrupa por tema_clave y elige el nombre que mejor se lee */
function agrupar(lista){
  const mapa = new Map();
  lista.forEach(x => {
    if (!x.tema_clave) return;
    const o = mapa.get(x.tema_clave) || { clave:x.tema_clave, nombres:new Map(), n:0,
      paises:new Set(), refs:new Set(), ids:[], accionados:0, sinRevisar:0 };
    o.n++;
    o.ids.push(x.id);
    o.nombres.set(x.tema, (o.nombres.get(x.tema) || 0) + 1);
    if (x.pais) o.paises.add(x.pais);
    if (x.referencias) o.refs.add(x.referencias);
    if (conMejora(x)) o.accionados++;
    if (!x.revisado) o.sinRevisar++;
    mapa.set(x.tema_clave, o);
  });
  const todos = Array.from(mapa.values());
  todos.forEach(o => {
    o.nombre = Array.from(o.nombres.entries())
      .sort((a, b) => (b[1] - a[1]) || (puntajeNombre(b[0]) - puntajeNombre(a[0])) || (b[0].length - a[0].length))[0][0];
  });
  return todos.sort((a, b) => (b.n - a.n) || a.nombre.localeCompare(b.nombre));
}

function pintarKpis(lista){
  const grupos = agrupar(lista);
  const antes = agrupar(base(1));
  let delta = "";
  if (antes.length || grupos.length){
    const d = lista.length - base(1).length;
    const signo = d >= 0 ? "▲" : "▼";
    delta = '<span class="delta ' + (d >= 0 ? "sube" : "baja") + '">' + signo + " " + Math.abs(d) + " vs. periodo anterior</span>";
  }
  const top = grupos[0];
  const sinRevisar = lista.filter(x => !x.revisado).length;
  const conAccion = lista.filter(conMejora).length;
  const repetidos = grupos.filter(o => o.n > 1).length;

  $("#kpis").innerHTML =
    tarjeta(num(lista.length), "Peticiones", delta, true) +
    tarjeta(num(grupos.length), "Temas distintos", repetidos ? num(repetidos) + " pedidos más de una vez" : "ninguno repetido") +
    tarjeta(top ? num(top.n) : "—", "Tema más pedido", top ? escapar(corto(top.nombre, 42)) : "sin datos") +
    tarjeta(num(sinRevisar), "Sin revisar", pct(sinRevisar, lista.length) + "% de las peticiones") +
    tarjeta(pct(conAccion, lista.length) + "%", "Ya con mejora", num(conAccion) + " de " + num(lista.length));
}

function pintarRanking(lista){
  const grupos = agrupar(lista);
  if (!grupos.length){ $("#ranking").innerHTML = '<p class="vacio">Sin peticiones en este periodo.</p>'; return; }
  const TOPE = 10;
  const visibles = verTodos ? grupos : grupos.slice(0, TOPE);
  const ocultos = grupos.length - visibles.length;

  const cuerpo = visibles.map(o => {
    const cubierto = cubiertos.has(o.clave);
    const marca = cubierto
      ? '<span class="etq lima">con mejora</span>'
      : (o.n > 1 ? '<span class="etq alerta">sin tocar</span>' : '<span class="mini">sin tocar</span>');
    const refs = Array.from(o.refs).join(" / ");
    const botones =
      '<button class="boton-chico" data-tema-accion="mejora" data-clave="' + escapar(o.clave) +
      '" data-nombre="' + escapar(o.nombre) + '">' +
      (cubierto ? "Enlazar mejora" : "Crear mejora") + '</button>' +
      '<button class="boton-chico" data-tema-accion="revisar" data-clave="' + escapar(o.clave) + '">' +
      (temaTodoRevisado(o.clave) ? "Quitar revisado" : "Marcar revisado") + '</button>';
    return '<tr class="pinchable' + (f.tema === o.clave ? ' activa' : '') + '" data-tema="' + escapar(o.clave) +
      '" data-nombre="' + escapar(o.nombre) + '" role="button" tabindex="0">' +
      '<td>' + escapar(corto(o.nombre, 70)) + '</td>' +
      '<td class="tabular"><b>' + o.n + '</b></td>' +
      '<td class="tabular">' + o.paises.size + '</td>' +
      '<td><span class="mini">' + (refs ? escapar(corto(refs, 44)) : "—") + '</span></td>' +
      '<td>' + marca + '</td>' +
      '<td>' + botones + '</td></tr>';
  }).join("");

  const alterna = (grupos.length > TOPE || verTodos)
    ? '<button class="boton-chico" id="btn-ver-todos">' +
      (verTodos ? "Ver solo los 10 más pedidos" : "Ver todos los temas (" + grupos.length + ")") +
      '</button>'
    : '';

  $("#ranking").innerHTML =
    '<table class="tabla"><thead><tr><th>Tema</th><th>Piden</th><th>Países</th>' +
    '<th>Referencias que piden</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
    cuerpo + '</tbody></table>' + alterna +
    '<p class="mini">Ordenado por cuánta gente pide lo mismo' +
    (ocultos > 0 ? ' · se muestran los ' + TOPE + ' más pedidos de ' + grupos.length + ' temas' : '') +
    '. La mejora y el revisado se aplican a todas las peticiones del tema. Si un tema es otra forma de ' +
    'decir algo que ya trabajaste, usa “Enlazar mejora” y elige la que ya existe. Escribiendo en el ' +
    'buscador de arriba traes cualquier tema al ranking. Las referencias son las guías que el médico ' +
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

/* Lista de solo lectura: aquí no hay botones, solo lo que dijeron */
function pintarPeticiones(lista){
  const orden = lista.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  $("#cuenta").textContent = lista.length === filas.length
    ? lista.length + " peticiones"
    : lista.length + " de " + filas.length + " peticiones";
  if (!orden.length){
    $("#peticiones").innerHTML = '<p class="vacio">Ninguna petición con estos filtros. Prueba con Histórico o quita los filtros.</p>';
    return;
  }
  $("#peticiones").innerHTML = orden.slice(0, 150).map(tarjetaPeticion).join("");
}

function tarjetaPeticion(x){
  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    (x.estrellas != null ? '<span class="nota">' + x.estrellas + ' ★</span>' : '') +
    (x.revisado ? '<span class="etq ok">revisado</span>' : '') +
    (conMejora(x) ? '<span class="etq lima">con mejora</span>' : '') +
    '</div>' +
    '<p>' + escapar(x.tema) + '</p>' +
    (x.referencias ? '<p class="mini">Referencias que pide: ' + escapar(x.referencias) + '</p>' : '') +
    (x.comentario ? '<p class="mini">También comentó: ' + escapar(x.comentario) + '</p>' : '') +
    '</article>';
}

/* ============================================================
   6. Barra de filtros activos
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
  if (f.tema) out.push({ campo:"tema", txt:"Tema: " + corto(f.temaNombre || f.tema, 40) });
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
    f.foco = "todas"; f.pais = ""; f.texto = ""; f.tema = ""; f.temaNombre = "";
    $("#f-pais").value = "";
    $("#f-texto").value = "";
    pintarChips();
  }
  else if (campo === "pais"){ f.pais = ""; $("#f-pais").value = ""; }
  else if (campo === "texto"){ f.texto = ""; $("#f-texto").value = ""; }
  else if (campo === "tema"){ f.tema = ""; f.temaNombre = ""; }
  else if (campo === "foco"){ f.foco = "todas"; pintarChips(); }
  pintar();
}

/* ============================================================
   7. Ayudas de presentación
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

function puntajeNombre(s){
  let p = 0;
  if (/^[A-ZÁÉÍÓÚÑ]/.test(s)) p += 2;
  if (/[áéíóúñÁÉÍÓÚÑ]/.test(s)) p += 1;
  return p;
}

function etqMes(m){
  return String(m).slice(5) + "/" + String(m).slice(2, 4);
}
