/* ============================================================
   CLINICAL HUB · PESTAÑA RESEÑAS
   Satisfacción: lo que los médicos califican y comentan.

   La pestaña tiene dos subpestañas del mismo peso, igual que
   Temas pedidos:

   INBOX    Las reseñas con comentario que todavía no tienen
            categoría. Histórico completo, sin filtros de fuente
            ni de periodo: solo categorizar o descartar. El
            globito de la subpestaña dice cuántas faltan, como
            los mensajes sin leer del teléfono.
   RANKING  El reflejo de todo lo ya categorizado: promedio,
            reparto de estrellas, mes a mes, tipo de problema,
            por dónde llegan y la lista completa de reseñas con
            los filtros de siempre.

   Lee public.v_resenas, que trae solo las filas con estrella o
   con comentario escrito de verdad. Las peticiones de temas ya
   no viven aquí: tienen su propia pestaña, Temas pedidos.
   ============================================================ */
import { sb, $, estado, COLORES, escapar, fecha, num, pct,
  nombreEtiqueta } from "./nucleo.js";
import { alternarRevisado, ventanaMejora, ventanaCategoria,
  descartarResenas } from "./triage.js";
import { categoriaPorClave, ventanaNuevaCategoria,
  ventanaRenombrarCategoria, ventanaBorrarCategoria } from "./categorias.js";

let filas = [];
let seleccion = new Set();
let visibles = [];
let qInbox = "";
let vista = "ranking";
const f = { canal:"todos", dias:90, foco:"todos", etiqueta:"", pais:"", texto:"", notas:[] };

const CANALES = [["todos","Todo"], ["web","Sitio web"], ["whatsapp","WhatsApp"]];
const RANGOS = [["7","1 semana"], ["30","1 mes"], ["90","90 días"], ["365","12 meses"], ["0","Histórico"]];
const FOCOS = [["todos","Todas"], ["texto","Con comentario"], ["criticos","Críticos 1–2"],
  ["sin_categoria","Sin categoría"], ["sin_accion","Sin mejora"]];
const NOTAS = [["","Todas"], ["5","5 ★"], ["4","4 ★"], ["3","3 ★"], ["2","2 ★"], ["1","1 ★"], ["0","Sin nota"]];

const GRUPOS = [{ clave:"promotor", nombre:"Promotores 4–5 ★", notas:["5","4"], color:5 },
  { clave:"neutro", nombre:"Neutros 3 ★", notas:["3"], color:3 },
  { clave:"detractor", nombre:"Detractores 1–2 ★", notas:["2","1"], color:1 }];

const DESCARTE = "sin_sentido";

/* Iconos de las categorías: el lápiz renombra, la caneca borra */
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
<div class="mast"><span class="etiqueta">Calidad del contenido</span><h1>Reseñas</h1></div>
<p>Cómo califican los médicos las guías, por web y por WhatsApp.</p>
</div>
<button class="boton-chico" id="btn-recargar">Actualizar</button>
</div>

<p class="aviso" id="aviso-panel" role="status"></p>

<div class="subpestanas" id="subpestanas" role="tablist" aria-label="Secciones de reseñas">
<button class="subpestana" role="tab" data-sub="inbox" id="sub-inbox"
aria-selected="false" aria-controls="panel-inbox">Inbox
<span class="globo" id="globo-inbox" hidden>0</span></button>
<button class="subpestana" role="tab" data-sub="ranking" id="sub-ranking"
aria-selected="true" aria-controls="panel-ranking">Ranking</button>
</div>

<section id="panel-inbox" role="tabpanel" aria-labelledby="sub-inbox" hidden>
<p class="resumen-sub" id="resumen-inbox"></p>
<section class="caja" style="margin-top:14px">
<span class="etiqueta">Nuevas por categorizar</span>
<p class="mini">Cada reseña llega tal cual la escribió el médico. Ponle la categoría que
explique de qué habla, o descártala si no dice nada aprovechable. En cuanto la categorizas
desaparece del inbox y empieza a sumar en el ranking. Aquí está todo el histórico, sin
filtros de fuente ni de periodo: nada se pierde hasta que lo toques. El buscador solo sirve
para encontrar y agrupar: no esconde nada del histórico.</p>
<input class="campo" id="q-inbox" placeholder="Buscar en el inbox: dosis, lento, interfaz…">
<div id="barra-bandeja"></div>
<div id="bandeja"><p class="vacio">Cargando…</p></div>
</section>
</section>

<section id="panel-ranking" role="tabpanel" aria-labelledby="sub-ranking" hidden>
<div class="filtros-fila">
<span class="rotulo">Fuente</span>
<div class="filtros" id="f-canal" role="group" aria-label="Fuente"></div>
</div>
<div class="filtros-fila">
<span class="rotulo">Periodo</span>
<div class="filtros" id="f-rango" role="group" aria-label="Periodo"></div>
</div>
<div class="filtros-fila">
<span class="rotulo">Reseñas</span>
<div class="filtros" id="f-notas" role="group" aria-label="Reseñas"></div>
</div>
<div class="filtros-fila">
<span class="rotulo">Filtros</span>
<div class="filtros" id="f-foco" role="group" aria-label="Foco"></div>
<select class="campo compacto" id="f-etiqueta" aria-label="Categoría"></select>
<select class="campo compacto" id="f-pais" aria-label="País"></select>
<input class="campo compacto buscador" id="f-texto" type="search" placeholder="Buscar en los comentarios…">
</div>

<div class="activos" id="activos" hidden></div>

<div class="tarjetas" id="kpis"></div>

<div class="rejilla">
<section class="caja">
<span class="etiqueta">Cómo se reparten las calificaciones</span><span class="mini">Toca un chip o una barra para filtrar</span>
<div class="reparto" id="reparto"></div>
<div id="balance"></div>
</section>
<section class="caja">
<span class="etiqueta">Mes a mes</span>
<div id="tendencia"></div>
</section>
</div>

<div class="rejilla">
<section class="caja">
<div class="fila-entre">
<span class="etiqueta">Tipo de problema</span>
<button class="boton-chico" id="btn-nueva-cat">Nueva categoría</button>
</div>
<span class="mini">Tus categorías, ordenadas por cuánto se usan</span>
<div id="etiquetas-top"></div>
</section>
<section class="caja">
<span class="etiqueta">Por dónde llegan</span><span class="mini">Volumen y nota de cada fuente</span>
<div id="fuentes"></div>
</section>
</div>

<section class="caja comentarios">
<div class="fila-entre">
<span class="etiqueta">Reseñas · primero las más críticas</span>
<span class="mini" id="cuenta-comentarios"></span>
</div>
<div id="comentarios"><p class="vacio">Cargando…</p></div>
</section>
</section>
`;
}

/* ============================================================
   2. Filtros y subpestañas
   ============================================================ */
function conectar(){
pintarChips();
pintarSubpestanas();
pintarSelectCategorias();

$("#subpestanas").addEventListener("click", e => {
const b = e.target.closest("button[data-sub]");
if (!b || b.dataset.sub === vista) return;
vista = b.dataset.sub;
pintarSubpestanas();
});

$("#f-canal").addEventListener("click", e => elegir(e, "canal"));
$("#f-rango").addEventListener("click", e => elegir(e, "dias"));
$("#f-foco").addEventListener("click", e => elegir(e, "foco"));
$("#f-etiqueta").addEventListener("change", e => { f.etiqueta = e.target.value; pintar(); });
$("#f-pais").addEventListener("change", e => { f.pais = e.target.value; pintar(); });
$("#f-texto").addEventListener("input", e => { f.texto = e.target.value.trim().toLowerCase(); pintar(); });
$("#f-notas").addEventListener("click", e => { const b = e.target.closest("button[data-n]"); if (b) alternarNota(b.dataset.n); });
$("#reparto").addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) alternarNota(b.dataset.n); });
$("#balance").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (b) alternarGrupo(b.dataset.g); });
$("#btn-recargar").addEventListener("click", () => cargar());
$("#comentarios").addEventListener("click", alClic);
$("#activos").addEventListener("click", e => {
const b = e.target.closest("[data-quitar]");
if (!b) return;
quitarFiltro(b.dataset.quitar, b.dataset.valor || "");
});
$("#btn-nueva-cat").addEventListener("click", () => ventanaNuevaCategoria(trasCambiarCatalogo));

$("#etiquetas-top").addEventListener("click", e => {
const bt = e.target.closest("button[data-cat-accion]");
if (bt){ accionDeCategoria(bt); return; }
const b = e.target.closest("[data-etiqueta]");
if (!b) return;
f.etiqueta = (f.etiqueta === b.dataset.etiqueta) ? "" : b.dataset.etiqueta;
$("#f-etiqueta").value = f.etiqueta;
pintar();
});

$("#panel-inbox").addEventListener("input", e => {
if (e.target && e.target.id === "q-inbox"){ qInbox = e.target.value || ""; pintarInbox(); }
});
$("#panel-inbox").addEventListener("click", alClicInbox);
}

function elegir(e, campo){
const b = e.target.closest("button[data-v]");
if (!b) return;
f[campo] = campo === "dias" ? Number(b.dataset.v) : b.dataset.v;
pintarChips();
pintar();
}

function pintarChips(){
fila("#f-canal", CANALES, f.canal);
fila("#f-rango", RANGOS, String(f.dias));
fila("#f-foco", FOCOS, f.foco);
}

function fila(donde, lista, activo){
$(donde).innerHTML = lista.map(par =>
'<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (String(par[0]) === String(activo)) + '">' +
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
   El inbox no filtra nada: mira el histórico completo. Los
   filtros de fuente y periodo son solo del ranking.
   ============================================================ */
async function cargar(){
const { data, error } = await sb.from("v_resenas").select("*").order("fecha", { ascending:false });
if (error){
const aviso = '<p class="vacio">No se pudieron leer las reseñas. ' + escapar(error.message) + '</p>';
$("#comentarios").innerHTML = aviso;
$("#bandeja").innerHTML = aviso;
return;
}
filas = data || [];
seleccion = new Set();
pintarPaises();
pintar();
}

function desdeHasta(atras){
const hasta = Date.now() - (atras || 0) * (f.dias * 86400000);
const desde = f.dias ? hasta - f.dias * 86400000 : 0;
return [desde, hasta];
}

function delCanal(x){ return f.canal === "todos" || x.canal === f.canal; }

function base(atras){
const par = desdeHasta(atras);
return filas.filter(x => {
if (!delCanal(x)) return false;
const t = new Date(x.fecha).getTime();
if (par[0] && t < par[0]) return false;
if (atras && t >= par[1]) return false;
return true;
});
}

function filtradas(omitir){
return base(0).filter(x => {
if (f.pais && x.pais !== f.pais) return false;
if (omitir !== "notas" && f.notas.length){ const k = x.estrellas == null ? "0" : String(x.estrellas); if (f.notas.indexOf(k) === -1) return false; }
if (f.etiqueta && (x.etiquetas || []).indexOf(f.etiqueta) === -1) return false;
if (f.foco === "texto" && !x.comentario) return false;
if (f.foco === "criticos" && !(x.estrellas != null && x.estrellas <= 2)) return false;
if (f.foco === "sin_categoria" && (!x.comentario || (x.etiquetas || []).length)) return false;
if (f.foco === "sin_accion" && (x.accionado || !x.comentario)) return false;
if (f.texto){
const saco = [x.comentario, x.tema_pedido, x.referencias, x.pais].join(" ").toLowerCase();
if (saco.indexOf(f.texto) === -1) return false;
}
return true;
});
}

const conNota = lista => lista.filter(x => x.estrellas != null);
const promedio = lista => conNota(lista).length
? conNota(lista).reduce((a, x) => a + x.estrellas, 0) / conNota(lista).length : null;

/* Una reseña sin comentario no entra al inbox: no hay nada que
   categorizar, solo cuenta para el promedio y el reparto. */
function pendientes(){
return filas.filter(x => x.comentario && !(x.etiquetas || []).length);
}

function categorizadas(){
return filas.filter(x => x.comentario && (x.etiquetas || []).length);
}

function descartadas(){
return categorizadas().filter(x => x.etiquetas.length === 1 && x.etiquetas[0] === DESCARTE);
}

/* ============================================================
   4. Pintado del ranking
   ============================================================ */
function pintar(){
const lista = filtradas();
pintarNotas(filtradas("notas"));
pintarKpis(lista);
pintarReparto(lista);
pintarBalance(lista);
pintarTendencia(lista);
pintarEtiquetas(lista);
pintarFuentes(lista);
pintarComentarios(lista);
pintarActivos();
pintarInbox();
pintarSubpestanas();
}

function tarjeta(cifra, etiqueta, extra, lima){
return '<div class="dato"><div class="cifra tabular' + (lima ? " lima" : "") + '">' + cifra + '</div>' +
'<span class="etiqueta">' + escapar(etiqueta) + '</span>' +
(extra ? '<span class="mini">' + extra + '</span>' : '') + '</div>';
}

function pintarKpis(lista){
const notas = conNota(lista);
const prom = promedio(lista);
const promAntes = promedio(base(1));
let delta = "";
if (prom != null && promAntes != null){
const d = prom - promAntes;
const signo = d >= 0 ? "▲" : "▼";
delta = '<span class="delta ' + (d >= 0 ? "sube" : "baja") + '">' + signo + " " + Math.abs(d).toFixed(2) + " vs. periodo anterior</span>";
}
const criticos = notas.filter(x => x.estrellas <= 2).length;
const conTexto = lista.filter(x => x.comentario);
const sinCategoria = conTexto.filter(x => !(x.etiquetas || []).length).length;
const accionados = conTexto.filter(x => x.accionado).length;

$("#kpis").innerHTML =
tarjeta(prom == null ? "—" : prom.toFixed(2), "Promedio", delta, true) +
tarjeta(num(notas.length), "Calificaciones", num(lista.length) + " reseñas en total") +
tarjeta(num(criticos), "Críticos 1–2", pct(criticos, notas.length) + "% de las notas") +
tarjeta(num(conTexto.length), "Con comentario", pct(conTexto.length, lista.length) + "% escribió algo") +
tarjeta(num(sinCategoria), "Sin categoría", sinCategoria ? "de " + num(conTexto.length) + " con comentario" : "todo al día") +
tarjeta(pct(accionados, conTexto.length) + "%", "Accionabilidad", num(accionados) + " de " + num(conTexto.length) + " con comentario");
}

function pintarReparto(lista){
const notas = conNota(lista);
const cuenta = { 1:0, 2:0, 3:0, 4:0, 5:0 };
notas.forEach(x => { cuenta[x.estrellas]++; });
const tope = Math.max(1, cuenta[1], cuenta[2], cuenta[3], cuenta[4], cuenta[5]);
$("#reparto").innerHTML = [5,4,3,2,1].map(n => {
const c = cuenta[n];
return '<div class="fila pinchable" data-n="' + n + '" role="button" tabindex="0" aria-pressed="' + (f.notas.indexOf(String(n)) > -1) + '">' +
'<span class="fila-etq">' + n + ' ★</span>' +
'<span class="barra"><span style="width:' + (c / tope * 100) + '%;background:' + COLORES[n] + '"></span></span>' +
'<span class="fila-num tabular"><b>' + c + '</b> · ' + pct(c, notas.length) + '%</span>' +
'</div>';
}).join("");
}

function pintarBalance(lista){
const caja = $("#balance");
if (!caja) return;
const notas = conNota(lista);
if (!notas.length){ caja.innerHTML = ""; return; }
const cuenta = GRUPOS.map(g => notas.filter(x => g.notas.indexOf(String(x.estrellas)) > -1).length);
const tope = Math.max(1, cuenta[0], cuenta[1], cuenta[2]);
const saldo = Math.round(cuenta[0] / notas.length * 100) - Math.round(cuenta[2] / notas.length * 100);
caja.innerHTML = '<span class="etiqueta sub">Balance de satisfacción</span>' +
GRUPOS.map((g, i) =>
'<div class="fila pinchable" data-g="' + g.clave + '" role="button" tabindex="0" aria-pressed="' + grupoActivo(g) + '">' +
'<span class="fila-etq">' + g.nombre + '</span>' +
'<span class="barra"><span style="width:' + (cuenta[i] / tope * 100) + '%;background:' + COLORES[g.color] + '"></span></span>' +
'<span class="fila-num tabular"><b>' + cuenta[i] + '</b> · ' + pct(cuenta[i], notas.length) + '%</span>' +
'</div>').join("") +
'<p class="mini">Promotores menos detractores: <b>' + (saldo > 0 ? "+" : "") + saldo +
'</b> puntos. Clic en una fila para quedarte solo con ese grupo.</p>';
}

function pintarFuentes(lista){
const caja = $("#fuentes");
if (!caja) return;
const mapa = new Map();
lista.forEach(x => {
const clave = x.origen || "sin origen";
const o = mapa.get(clave) || { clave: clave, n:0, suma:0, con:0, texto:0 };
o.n++;
if (x.comentario) o.texto++;
if (x.estrellas != null){ o.suma += x.estrellas; o.con++; }
mapa.set(clave, o);
});
const top = Array.from(mapa.values()).sort((a, b) => b.n - a.n);
if (!top.length){ caja.innerHTML = '<p class="vacio">Sin reseñas en este periodo.</p>'; return; }
const tope = top[0].n;
caja.innerHTML = top.map(o =>
'<div class="fila">' +
'<span class="fila-etq">' + escapar(nombreOrigen(o.clave)) + '</span>' +
'<span class="barra"><span style="width:' + (o.n / tope * 100) + '%;background:var(--brand)"></span></span>' +
'<span class="fila-num tabular"><b>' + o.n + '</b> · ' + (o.con ? (o.suma / o.con).toFixed(1) + "★" : "—") + '</span>' +
'</div>').join("") +
'<p class="mini">La cifra es el volumen de reseñas y la estrella el promedio de esa fuente.</p>';
}

function porMes(lista){
const mapa = new Map();
lista.forEach(x => {
const m = String(x.dia || x.fecha).slice(0, 7);
const o = mapa.get(m) || { mes:m, n:0, suma:0, con:0, criticos:0 };
o.n++;
if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
mapa.set(m, o);
});
return Array.from(mapa.values()).sort((a, b) => a.mes < b.mes ? -1 : 1).slice(-12);
}

function pintarTendencia(lista){
const meses = porMes(lista);
if (!meses.length){ $("#tendencia").innerHTML = '<p class="vacio">Sin datos en este periodo.</p>'; return; }

const puntos = meses.map((m, i) => ({ i: i, mes: m.mes, n: m.n, con: m.con, prom: m.con ? m.suma / m.con : null }));
const conValor = puntos.filter(p => p.prom != null);
const W = Math.max(320, puntos.length * 74);
const H = 190, ix = 34, dx = 18, ay = 26, ab = 34;
const ancho = W - ix - dx, alto = H - ay - ab;
const px = i => puntos.length === 1 ? ix + ancho / 2 : ix + (i / (puntos.length - 1)) * ancho;
const py = v => ay + (5 - v) / 4 * alto;

let s = '<svg class="lineas" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Promedio de estrellas por mes">';
s += '<rect class="banda verde" x="' + ix + '" y="' + py(5) + '" width="' + ancho + '" height="' + (py(4.5) - py(5)) + '"></rect>';
s += '<rect class="banda azul" x="' + ix + '" y="' + py(4.5) + '" width="' + ancho + '" height="' + (py(3.5) - py(4.5)) + '"></rect>';
s += '<rect class="banda roja" x="' + ix + '" y="' + py(3.5) + '" width="' + ancho + '" height="' + (py(1) - py(3.5)) + '"></rect>';
[5, 4, 3, 2, 1].forEach(v => {
s += '<line class="guia" x1="' + ix + '" y1="' + py(v) + '" x2="' + (W - dx) + '" y2="' + py(v) + '"></line>';
s += '<text class="eje" x="' + (ix - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + '</text>';
});
for (let i = 1; i < puntos.length; i++){
const a = puntos[i - 1], b = puntos[i];
if (a.prom == null || b.prom == null) continue;
s += '<line class="tramo" x1="' + px(a.i) + '" y1="' + py(a.prom) + '" x2="' + px(b.i) + '" y2="' + py(b.prom) + '" stroke="' + colorNota(b.prom) + '"></line>';
}
puntos.forEach(p => {
const x = px(p.i);
if (p.prom == null){
s += '<g class="punto"><circle class="punto-vacio" cx="' + x + '" cy="' + py(1) + '" r="3"></circle>' +
'<title>' + etqMes(p.mes) + ': sin calificaciones, ' + p.n + ' reseñas</title></g>';
} else {
const c = colorNota(p.prom);
const fiesta = p.prom >= 4.5;
s += '<g class="punto' + (fiesta ? ' festeja' : '') + '">';
if (fiesta) s += '<circle class="aura" cx="' + x + '" cy="' + py(p.prom) + '" r="9" fill="' + c + '"></circle>';
s += '<circle class="bolita" cx="' + x + '" cy="' + py(p.prom) + '" r="5.5" fill="' + c + '"></circle>';
const anc = p.i === 0 ? "start" : (p.i === puntos.length - 1 ? "end" : "middle");
const ax = p.i === 0 ? x - 4 : (p.i === puntos.length - 1 ? x + 4 : x);
s += '<text class="valor" x="' + ax + '" y="' + (py(p.prom) - 12) + '" text-anchor="' + anc + '" fill="' + c + '">' + p.prom.toFixed(1) + '</text>';
s += '<title>' + etqMes(p.mes) + ': ' + p.prom.toFixed(2) + ' con ' + p.con + ' calificaciones de ' + p.n + ' reseñas</title></g>';
}
s += '<text class="eje" x="' + x + '" y="' + (H - 12) + '" text-anchor="middle">' + etqMes(p.mes) + '</text>';
});
s += '</svg>';

const ultimo = conValor.length ? conValor[conValor.length - 1] : null;
let fiesta = '';
if (ultimo && ultimo.prom >= 4.5){
fiesta = '<div class="festejo"><span class="chispas"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
'<b>Mes en verde: ' + etqMes(ultimo.mes) + ' cerró en ' + ultimo.prom.toFixed(2) + '</b></div>';
}
$("#tendencia").innerHTML = s + fiesta +
'<p class="mini">Promedio de estrellas por mes. Rojo por debajo de 3.5, azul entre 3.5 y 4.5, verde de 4.5 en adelante.</p>';
}

/* Tus categorías, no solo las que ya tienen reseñas: si las vacías no
   aparecieran, no habría forma de renombrarlas ni de borrarlas desde
   aquí. Las claves viejas que quedaron pegadas a alguna reseña también
   salen, para poder limpiarlas. */
function categoriasEnPantalla(lista){
const mapa = new Map();
lista.forEach(x => (x.etiquetas || []).forEach(e => {
const o = mapa.get(e) || { clave:e, n:0, suma:0, con:0, criticos:0 };
o.n++;
if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
mapa.set(e, o);
}));
estado.etiquetas.forEach(e => {
if (!mapa.has(e.clave)) mapa.set(e.clave, { clave:e.clave, n:0, suma:0, con:0, criticos:0 });
});
return Array.from(mapa.values()).sort((a, b) => (b.n - a.n) ||
nombreEtiqueta(a.clave).localeCompare(nombreEtiqueta(b.clave)));
}

function pintarEtiquetas(lista){
const cats = categoriasEnPantalla(lista);
const clasificados = lista.filter(x => (x.etiquetas || []).length).length;
if (!cats.length){
$("#etiquetas-top").innerHTML = '<p class="vacio">Todavía no tienes categorías. ' +
'Crea la primera con el botón de arriba.</p>';
return;
}
const tope = Math.max(1, cats[0].n);
$("#etiquetas-top").innerHTML = cats.map(t =>
'<div class="fila pinchable" data-etiqueta="' + escapar(t.clave) + '" role="button" tabindex="0">' +
'<span class="fila-etq">' + escapar(nombreEtiqueta(t.clave)) + '</span>' +
'<span class="barra"><span style="width:' + (t.n / tope * 100) + '%;background:' +
(t.criticos > t.n / 2 ? "var(--s1)" : "var(--brand)") + '"></span></span>' +
'<span class="fila-num tabular"><b>' + t.n + '</b> · ' + (t.con ? (t.suma / t.con).toFixed(1) + "★" : "—") + '</span>' +
'<span style="display:inline-flex;gap:2px;margin-left:6px;flex:0 0 auto">' +
'<button class="icono-btn" data-cat-accion="renombrar" data-clave="' + escapar(t.clave) +
'" title="Renombrar categoría" aria-label="Renombrar categoría">' + LAPIZ + '</button>' +
'<button class="icono-btn peligro" data-cat-accion="borrar" data-clave="' + escapar(t.clave) +
'" title="Borrar categoría" aria-label="Borrar categoría">' + CANECA + '</button>' +
'</span>' +
'</div>').join("") +
'<p class="mini">' + num(clasificados) + ' de ' + num(lista.length) +
' reseñas categorizadas en este periodo. Clic en un motivo para filtrar; la barra roja avisa ' +
'que la mayoría son críticas. El lápiz cambia el nombre y la caneca borra la categoría, ' +
'moviendo antes sus reseñas a donde tú digas.</p>';
}

/* ============================================================
   Administrar el catálogo de categorías
   Igual que el ranking de temas: el lápiz renombra, la caneca
   borra y el botón de la caja crea. Lo que toca Supabase vive en
   categorias.js; aquí solo se repinta lo que quedó distinto.
   ============================================================ */
function pintarSelectCategorias(){
const sel = $("#f-etiqueta");
if (!sel) return;
sel.innerHTML = '<option value="">Todas las categorías</option>' +
estado.etiquetas.map(e => '<option value="' + escapar(e.clave) + '">' +
escapar(e.nombre) + '</option>').join("");
sel.value = f.etiqueta;
}

/* Si estabas filtrando por una categoría que acabas de borrar, se
   suelta el filtro para no dejar la pantalla en blanco. */
async function trasCambiarCatalogo(){
if (f.etiqueta && !categoriaPorClave(f.etiqueta)) f.etiqueta = "";
pintarSelectCategorias();
await cargar();
}

function resenasCon(clave){
return filas.filter(x => (x.etiquetas || []).indexOf(clave) > -1);
}

function accionDeCategoria(bt){
const clave = bt.dataset.clave;
const cat = categoriaPorClave(clave) ||
{ clave: clave, nombre: nombreEtiqueta(clave), descripcion: "" };
if (bt.dataset.catAccion === "renombrar"){
ventanaRenombrarCategoria(cat, trasCambiarCatalogo);
return;
}
if (bt.dataset.catAccion === "borrar"){
ventanaBorrarCategoria(cat, resenasCon(clave), trasCambiarCatalogo);
}
}

function pintarComentarios(lista){
const orden = lista.slice()
.sort((a, b) => ((a.estrellas == null ? 9 : a.estrellas) - (b.estrellas == null ? 9 : b.estrellas)) ||
(new Date(b.fecha) - new Date(a.fecha)));
$("#cuenta-comentarios").textContent = lista.filter(x => x.comentario).length + " con comentario · " +
(lista.length === filas.length ? lista.length + " reseñas" : lista.length + " de " + filas.length + " reseñas");
if (!orden.length){
$("#comentarios").innerHTML = '<p class="vacio">Ninguna reseña con estos filtros. Prueba con Histórico o quita el filtro de estrellas.</p>';
return;
}
$("#comentarios").innerHTML = orden.slice(0, 150).map(tarjetaComentario).join("");
}

function tarjetaComentario(x){
const etqs = (x.etiquetas || []).map(e => '<span class="etq">' + escapar(nombreEtiqueta(e)) + '</span>').join("");
return '<article class="comentario" style="border-left-color:' + (COLORES[x.estrellas] || "var(--border2)") + '">' +
'<div class="comentario-meta">' +
'<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
'<span class="canal">' + (x.canal === "whatsapp" ? "WhatsApp" : "Web") + '</span>' +
'<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
(x.revisado ? '<span class="etq ok">revisado</span>' : '') +
(x.accionado ? '<span class="etq lima">con mejora</span>' : '') +
'</div>' +
(x.comentario ? '<p>' + escapar(x.comentario) + '</p>' : '<p class="mini">Calificó pero no escribió comentario.</p>') +
(x.tema_pedido ? '<p class="mini">Además pidió un tema: ' + escapar(x.tema_pedido) +
(x.referencias ? ' · referencias: ' + escapar(x.referencias) : '') + '</p>' : '') +
'<div class="comentario-pie">' + etqs +
(x.comentario ? '<button class="boton-chico" data-accion="categorizar" data-id="' + x.id + '">Categorizar</button>' : '') +
'<button class="boton-chico" data-accion="revisar" data-id="' + x.id + '">' + (x.revisado ? "Quitar revisado" : "Marcar revisado") + '</button>' +
'<button class="boton-chico" data-accion="mejora" data-id="' + x.id + '">Convertir en mejora</button>' +
'</div></article>';
}

/* ============================================================
   5. Inbox: lo que falta categorizar
   Sin periodo y sin filtros: aquí está el histórico completo de
   reseñas con comentario y sin categoría. En cuanto le pones una
   categoría sale del inbox y aparece en el ranking.
   ============================================================ */
function pintarInbox(){
const pend = pendientes().slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
pintarGlobo(pend.length);

const q = qInbox.trim().toLowerCase();
const vistas = q ? pend.filter(x => coincide(x, q)) : pend;
visibles = vistas.map(x => String(x.id));

const res = $("#resumen-inbox");
if (res) res.innerHTML = (pend.length
? "<b>" + num(pend.length) + "</b> " +
(pend.length === 1 ? "reseña esperando categoría" : "reseñas esperando categoría")
: "Todo categorizado: no queda ninguna reseña sin categoría") +
" · <b>" + num(categorizadas().length - descartadas().length) + "</b> ya categorizadas" +
(descartadas().length ? " · " + num(descartadas().length) +
(descartadas().length === 1 ? " descartada" : " descartadas") : "") +
(q ? " · buscando “" + escapar(qInbox.trim()) + "”: <b>" + num(vistas.length) + "</b>" +
(vistas.length === 1 ? " coincide" : " coinciden") : "");

if (!pend.length){
$("#bandeja").innerHTML = '<p class="vacio">Inbox vacío: no queda ninguna reseña sin categoría.</p>';
pintarBarraBandeja();
return;
}
$("#bandeja").innerHTML = vistas.length
? vistas.map(tarjetaPendiente).join("")
: '<p class="vacio">Ninguna reseña del inbox dice eso. Prueba con otra palabra o borra la búsqueda.</p>';
pintarBarraBandeja();
}

/* El buscador no esconde histórico ni cambia el globito: solo sirve
   para juntar rápido las que hablan de lo mismo y mandarlas de una
   a la misma categoría. */
function coincide(x, q){
return (String(x.comentario || "") + " " + String(x.tema_pedido || "") + " " +
String(x.referencias || "") + " " + nombrePais(x.pais)).toLowerCase().indexOf(q) > -1;
}

function tarjetaPendiente(x){
const id = escapar(String(x.id));
return '<article class="comentario" style="border-left-color:' + (COLORES[x.estrellas] || "var(--border2)") + '">' +
'<div class="comentario-meta">' +
'<label class="mini"><input type="checkbox" data-sel-pend="' + id + '"' +
(seleccion.has(String(x.id)) ? " checked" : "") + '> elegir</label>' +
'<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
'<span class="canal">' + (x.canal === "whatsapp" ? "WhatsApp" : "Web") + '</span>' +
'<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
'</div>' +
'<p>' + escapar(x.comentario) + '</p>' +
(x.tema_pedido ? '<p class="mini">Además pidió un tema: ' + escapar(x.tema_pedido) +
(x.referencias ? ' · referencias: ' + escapar(x.referencias) : '') + '</p>' : '') +
'<div class="fila-entre" style="margin:11px 0 0">' +
'<span class="mini">Sin categoría todavía</span>' +
'<span><button class="boton-chico" data-pend-accion="categorizar" data-id="' + id + '">Categorizar</button> ' +
'<button class="boton-chico" data-pend-accion="descartar" data-id="' + id + '">Descartar</button></span>' +
'</div></article>';
}

function pintarBarraBandeja(){
const caja = $("#barra-bandeja");
if (!caja) return;
const n = seleccion.size;
const v = visibles.length;
if (!n && !v){ caja.innerHTML = ""; return; }
const izq = n
? '<b>' + n + '</b> ' + (n === 1 ? "reseña elegida" : "reseñas elegidas") +
' · van juntas a la misma categoría'
: 'Marca varias y se van juntas a la misma categoría';
caja.innerHTML = '<div class="fila-entre" style="margin:12px 0 10px">' +
'<span class="mini">' + izq + '</span><span>' +
(v ? '<button class="boton-chico" id="btn-sel-todas">Elegir las ' + v + ' que se ven</button> ' : '') +
(n ? '<button class="boton-chico" id="btn-cat-sel">Categorizar juntas</button> ' +
'<button class="boton-chico" id="btn-desc-sel">Descartar</button> ' +
'<button class="boton-chico" id="btn-sel-nada">Quitar selección</button>' : '') +
'</span></div>';
}

function alClicInbox(e){
const cb = e.target.closest("input[data-sel-pend]");
if (cb){
if (cb.checked) seleccion.add(cb.dataset.selPend); else seleccion.delete(cb.dataset.selPend);
pintarBarraBandeja();
return;
}
if (e.target.closest("#btn-sel-todas")){
visibles.forEach(id => seleccion.add(id));
pintarInbox();
return;
}
if (e.target.closest("#btn-cat-sel")){ categorizarSeleccion(); return; }
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
const x = filas.filter(r => String(r.id) === bt.dataset.id)[0];
if (!x) return;
if (bt.dataset.pendAccion === "categorizar"){ ventanaCategoria([x], cargar); return; }
if (bt.dataset.pendAccion === "descartar") descartarResenas([x], cargar);
}

function elegidas(){
return filas.filter(x => seleccion.has(String(x.id)));
}

function categorizarSeleccion(){
const lista = elegidas();
if (!lista.length) return;
ventanaCategoria(lista, cargar);
}

function descartarSeleccion(){
const lista = elegidas();
if (!lista.length) return;
descartarResenas(lista, cargar);
}

/* ============================================================
   6. Acciones sobre una reseña de la lista del ranking
   ============================================================ */
function alClic(e){
const b = e.target.closest("button[data-accion]");
if (!b) return;
const x = filas.find(r => r.id === b.dataset.id);
if (!x) return;
if (b.dataset.accion === "categorizar") ventanaCategoria([x], cargar);
if (b.dataset.accion === "revisar") alternarRevisado(x, b, cargar);
if (b.dataset.accion === "mejora") ventanaMejora(x, cargar);
}

/* ============================================================
   7. Filtro por calificación (chips y barras del reparto)
   ============================================================ */
function rotuloDe(lista, v){
const par = lista.find(x => String(x[0]) === String(v));
return par ? par[1] : String(v);
}

function fichasActivas(){
const out = [];
if (f.canal !== "todos") out.push({ campo:"canal", valor:"", txt:"Fuente: " + rotuloDe(CANALES, f.canal) });
if (f.foco !== "todos") out.push({ campo:"foco", valor:"", txt:rotuloDe(FOCOS, f.foco) });
f.notas.slice().sort().reverse().forEach(n =>
out.push({ campo:"nota", valor:n, txt:"Reseña: " + rotuloDe(NOTAS, n) }));
if (f.etiqueta) out.push({ campo:"etiqueta", valor:"", txt:"Categoría: " + nombreEtiqueta(f.etiqueta) });
if (f.pais) out.push({ campo:"pais", valor:"", txt:"País: " + nombrePais(f.pais) });
if (f.texto) out.push({ campo:"texto", valor:"", txt:"Busca: " + f.texto });
return out;
}

function pintarActivos(){
const caja = $("#activos");
if (!caja) return;
const sel = $("#f-etiqueta");
if (sel) sel.classList.toggle("filtrando", !!f.etiqueta);
const selPais = $("#f-pais");
if (selPais) selPais.classList.toggle("filtrando", !!f.pais);
const lista = fichasActivas();
caja.hidden = !lista.length;
if (!lista.length){ caja.innerHTML = ""; return; }
caja.innerHTML = '<span class="rotulo">Filtrando por</span>' +
lista.map(x => '<button class="ficha" title="Quitar este filtro" data-quitar="' + x.campo +
'" data-valor="' + escapar(x.valor) + '">' + escapar(x.txt) +
'<span aria-hidden="true">×</span></button>').join("") +
'<button class="ficha limpiar" data-quitar="todo">Quitar filtros</button>';
}

function quitarFiltro(campo, valor){
if (campo === "todo"){
f.canal = "todos"; f.foco = "todos"; f.etiqueta = ""; f.pais = ""; f.texto = ""; f.notas = [];
$("#f-etiqueta").value = "";
$("#f-pais").value = "";
$("#f-texto").value = "";
pintarChips();
}
else if (campo === "nota"){ const i = f.notas.indexOf(valor); if (i > -1) f.notas.splice(i, 1); }
else if (campo === "etiqueta"){ f.etiqueta = ""; $("#f-etiqueta").value = ""; }
else if (campo === "pais"){ f.pais = ""; $("#f-pais").value = ""; }
else if (campo === "texto"){ f.texto = ""; $("#f-texto").value = ""; }
else { f[campo] = "todos"; pintarChips(); }
pintar();
}

function grupoActivo(g){
return g.notas.length === f.notas.length && g.notas.every(n => f.notas.indexOf(n) > -1);
}

function alternarGrupo(clave){
const g = GRUPOS.find(x => x.clave === clave);
if (!g) return;
f.notas = grupoActivo(g) ? [] : g.notas.slice();
pintar();
}

function alternarNota(v){
if (v === "") f.notas = [];
else {
const i = f.notas.indexOf(v);
if (i > -1) f.notas.splice(i, 1); else f.notas.push(v);
}
pintar();
}

function pintarNotas(lista){
const caja = $("#f-notas");
if (!caja) return;
const cuenta = {};
(lista || []).forEach(x => {
const k = x.estrellas == null ? "0" : String(x.estrellas);
cuenta[k] = (cuenta[k] || 0) + 1;
});
caja.innerHTML = NOTAS.map(par => {
const v = par[0];
const activo = v === "" ? f.notas.length === 0 : f.notas.indexOf(v) > -1;
const n = v === "" ? (lista || []).length : (cuenta[v] || 0);
return '<button class="chip" data-n="' + v + '" aria-pressed="' + activo + '">' +
par[1] + ' <b class="tabular">' + n + '</b></button>';
}).join("");
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

const ORIGENES = { "whatsapp":"WhatsApp", "encuesta-modal":"Encuesta del sitio", "sitio-web":"Sitio web" };

function nombreOrigen(o){
return ORIGENES[o] || o;
}

function colorNota(v){
if (v == null) return "#8a8a8a";
if (v < 3.5) return "#d64545";
if (v < 4.5) return "#2f6fed";
return "#18a058";
}

function etqMes(m){
return String(m).slice(5) + "/" + String(m).slice(2, 4);
}
