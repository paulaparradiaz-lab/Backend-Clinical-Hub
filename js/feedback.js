/* ============================================================
   CLINICAL HUB · PESTAÑA FEEDBACK
   Análisis del feedback y el paso de un comentario a una mejora.
   Lee public.v_feedback_detalle (feedback + triage + etiquetas + acciones).
   ============================================================ */
import { sb, $, estado, COLORES, escapar, fecha, num, pct, avisar,
         abrirVentana, leer, opcionesEquipo, opciones, nombreEtiqueta } from "./nucleo.js";

let filas = [];
const f = { canal:"todos", tipo:"todos", dias:90, foco:"todos", etiqueta:"", pais:"", texto:"", notas:[], tema:"", temaNombre:"" };

const CANALES = [["todos","Todo"], ["web","Sitio web"], ["whatsapp","WhatsApp"]];
const TIPOS   = [["todos","Todo"], ["opinion","Opiniones"], ["busqueda","Búsquedas"]];
const RANGOS  = [["7","1 semana"], ["30","1 mes"], ["90","90 días"], ["365","12 meses"], ["0","Histórico"]];
const FOCOS   = [["todos","Todas"], ["texto","Con comentario"], ["criticos","Críticos 1–2"],
                 ["sin_revisar","Sin revisar"], ["sin_accion","Sin mejora"]];

const NOTAS = [["","Todas"], ["5","5 ★"], ["4","4 ★"], ["3","3 ★"], ["2","2 ★"], ["1","1 ★"], ["0","Sin nota"]];

const GRUPOS = [{ clave:"promotor",  nombre:"Promotores 4–5 ★",  notas:["5","4"], color:5 },
                { clave:"neutro",    nombre:"Neutros 3 ★",       notas:["3"],     color:3 },
                { clave:"detractor", nombre:"Detractores 1–2 ★", notas:["2","1"], color:1 }];

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
      <div class="mast"><span class="etiqueta">Calidad del contenido</span><h1>Feedback</h1></div>
      <p>Lo que dicen los médicos de las guías, por web y por WhatsApp.</p>
    </div>
    <button class="boton-chico" id="btn-recargar">Actualizar</button>
  </div>

  <div class="filtros-fila">
    <span class="rotulo">Fuente</span>
    <div class="filtros" id="f-canal" role="group" aria-label="Fuente"></div>
  </div>
  <div class="filtros-fila">
    <span class="rotulo">Tipo</span>
    <div class="filtros" id="f-tipo" role="group" aria-label="Tipo de registro"></div>
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
    <select class="campo compacto" id="f-etiqueta" aria-label="Etiqueta"></select>
    <select class="campo compacto" id="f-pais" aria-label="País"></select>
    <input class="campo compacto buscador" id="f-texto" type="search" placeholder="Buscar en los comentarios…">
  </div>

  <div class="activos" id="activos" hidden></div>

  <p class="aviso" id="aviso-panel" role="status"></p>

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
      <span class="etiqueta">Tipo de problema</span><span class="mini">Lo clasificas tú al etiquetar</span>
      <div id="etiquetas-top"></div>
    </section>
    <section class="caja">
      <span class="etiqueta">Temas que están pidiendo</span>
      <div id="duele"></div>
    </section>
  </div>

  <section class="caja comentarios">
    <div class="fila-entre">
      <span class="etiqueta">Comentarios · primero los más críticos</span>
      <span class="mini" id="cuenta-comentarios"></span>
    </div>
    <div id="comentarios"><p class="vacio">Cargando…</p></div>
  </section>
`;
}

/* ============================================================
   2. Filtros
   ============================================================ */
function conectar(){
  pintarChips();
  $("#f-etiqueta").innerHTML = '<option value="">Todas las etiquetas</option>' +
    estado.etiquetas.map(e => '<option value="' + e.clave + '">' + escapar(e.nombre) + '</option>').join("");

  $("#f-canal").addEventListener("click", e => elegir(e, "canal"));
  $("#f-tipo").addEventListener("click", e => elegir(e, "tipo"));
  $("#f-rango").addEventListener("click", e => elegir(e, "dias"));
  $("#f-foco").addEventListener("click",  e => elegir(e, "foco"));
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
  $("#duele").addEventListener("click", e => {
    const fila = e.target.closest("[data-tema]");
    if (!fila) return;
    f.tema = (f.tema === fila.dataset.tema) ? "" : fila.dataset.tema;
    f.temaNombre = f.tema ? (fila.dataset.nombre || fila.dataset.tema) : "";
    pintar();
  });
  $("#etiquetas-top").addEventListener("click", e => {
    const b = e.target.closest("[data-etiqueta]");
    if (!b) return;
    f.etiqueta = (f.etiqueta === b.dataset.etiqueta) ? "" : b.dataset.etiqueta;
    $("#f-etiqueta").value = f.etiqueta;
    pintar();
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
  fila("#f-canal", CANALES, f.canal);
  fila("#f-tipo", TIPOS, f.tipo);
  fila("#f-rango", RANGOS,  String(f.dias));
  fila("#f-foco",  FOCOS,   f.foco);
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
   ============================================================ */
async function cargar(){
  const { data, error } = await sb.from("v_feedback_detalle").select("*").order("fecha", { ascending:false });
  if (error){
    $("#comentarios").innerHTML = '<p class="vacio">No se pudieron leer los datos. ' + escapar(error.message) + '</p>';
    return;
  }
  filas = data || [];
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
    if (f.tipo === "opinion" && esBusqueda(x)) return false;
    if (f.tipo === "busqueda" && !esBusqueda(x)) return false;
    if (f.pais && x.pais !== f.pais) return false;
    if (omitir !== "notas" && f.notas.length){ const k = x.estrellas == null ? "0" : String(x.estrellas); if (f.notas.indexOf(k) === -1) return false; }
    if (omitir !== "tema" && f.tema && normalizar(x.guia_de_referencia || x.tema_puntual || "") !== f.tema) return false;
    if (f.etiqueta && (x.etiquetas || []).indexOf(f.etiqueta) === -1) return false;
    if (f.foco === "texto" && !x.texto) return false;
    if (f.foco === "criticos" && !(x.estrellas != null && x.estrellas <= 2)) return false;
    if (f.foco === "sin_revisar" && (x.revisado || !x.texto)) return false;
    if (f.foco === "sin_accion" && (x.accionado || !x.texto)) return false;
    if (f.texto){
      const saco = [x.mejora, x.tema_puntual, x.guia_de_referencia, x.pais].join(" ").toLowerCase();
      if (saco.indexOf(f.texto) === -1) return false;
    }
    return true;
  });
}

const conNota = lista => lista.filter(x => x.estrellas != null);
const promedio = lista => conNota(lista).length
  ? conNota(lista).reduce((a, x) => a + x.estrellas, 0) / conNota(lista).length : null;

/* ============================================================
   4. Pintado
   ============================================================ */
function pintar(){
  const lista = filtradas();
  pintarNotas(filtradas("notas"));
  pintarKpis(lista);
  pintarReparto(lista);
  pintarBalance(lista);
  pintarTendencia(lista);
  pintarEtiquetas(lista);
  pintarDuele(filtradas("tema"));
  pintarComentarios(lista);
  pintarActivos();
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
  const busquedas = lista.filter(esBusqueda).length;
  const conTexto = lista.filter(x => x.texto);
  const sinRevisar = conTexto.filter(x => !x.revisado).length;
  const accionados = conTexto.filter(x => x.accionado).length;

  $("#kpis").innerHTML =
    tarjeta(prom == null ? "—" : prom.toFixed(2), "Promedio", delta, true) +
    tarjeta(num(notas.length), "Calificaciones", num(lista.length) + " respuestas" +
      (busquedas ? " · " + num(busquedas) + " de búsqueda" : "")) +
    tarjeta(num(criticos), "Críticos 1–2", pct(criticos, notas.length) + "% de las notas") +
    tarjeta(num(conTexto.length), "Con comentario", pct(conTexto.length, lista.length) + "% de las respuestas") +
    tarjeta(num(sinRevisar), "Sin revisar", sinRevisar ? "de " + num(conTexto.length) + " con comentario" : "todo al día") +
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
        '<title>' + etqMes(p.mes) + ': sin calificaciones, ' + p.n + ' respuestas</title></g>';
    } else {
      const c = colorNota(p.prom);
      const fiesta = p.prom >= 4.5;
      s += '<g class="punto' + (fiesta ? ' festeja' : '') + '">';
      if (fiesta) s += '<circle class="aura" cx="' + x + '" cy="' + py(p.prom) + '" r="9" fill="' + c + '"></circle>';
      s += '<circle class="bolita" cx="' + x + '" cy="' + py(p.prom) + '" r="5.5" fill="' + c + '"></circle>';
      const anc = p.i === 0 ? "start" : (p.i === puntos.length - 1 ? "end" : "middle");
      const ax = p.i === 0 ? x - 4 : (p.i === puntos.length - 1 ? x + 4 : x);
      s += '<text class="valor" x="' + ax + '" y="' + (py(p.prom) - 12) + '" text-anchor="' + anc + '" fill="' + c + '">' + p.prom.toFixed(1) + '</text>';
      s += '<title>' + etqMes(p.mes) + ': ' + p.prom.toFixed(2) + ' con ' + p.con + ' calificaciones de ' + p.n + ' respuestas</title></g>';
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

function pintarEtiquetas(lista){
  const mapa = new Map();
  const clasificados = lista.filter(x => (x.etiquetas || []).length).length;
  lista.forEach(x => (x.etiquetas || []).forEach(e => {
    const o = mapa.get(e) || { clave:e, n:0, suma:0, con:0, criticos:0, accionados:0 };
    o.n++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
    if (x.accionado) o.accionados++;
    mapa.set(e, o);
  }));
  const top = Array.from(mapa.values()).sort((a, b) => b.n - a.n).slice(0, 10);
  if (!top.length){
    $("#etiquetas-top").innerHTML = '<p class="vacio">Ningún comentario clasificado en este periodo. Empieza por los críticos.</p>';
    return;
  }
  const tope = top[0].n;
  $("#etiquetas-top").innerHTML = top.map(t =>
    '<div class="fila pinchable" data-etiqueta="' + t.clave + '" role="button" tabindex="0">' +
      '<span class="fila-etq">' + escapar(nombreEtiqueta(t.clave)) + '</span>' +
      '<span class="barra"><span style="width:' + (t.n / tope * 100) + '%;background:' + (t.criticos > t.n / 2 ? "var(--s1)" : "var(--brand)") + '"></span></span>' +
      '<span class="fila-num tabular"><b>' + t.n + '</b> · ' + (t.con ? (t.suma / t.con).toFixed(1) + "★" : "—") + '</span>' +
    '</div>').join("") +
    '<p class="mini">' + num(clasificados) + ' de ' + num(lista.length) +
    ' comentarios clasificados. Clic en un motivo para filtrar; la barra roja avisa que la mayoría son críticos.</p>';
}

function pintarDuele(lista){
  const mapa = new Map();
  lista.forEach(x => {
    const crudo = (x.guia_de_referencia || x.tema_puntual || "").trim();
    if (!crudo) return;
    const clave = normalizar(crudo);
    const o = mapa.get(clave) || { clave: clave, nombres: new Map(), n: 0, criticos: 0, suma: 0, con: 0, accionados: 0, conTexto: 0 };
    o.n++;
    o.nombres.set(crudo, (o.nombres.get(crudo) || 0) + 1);
    if (x.texto) o.conTexto++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
    if (x.accionado) o.accionados++;
    mapa.set(clave, o);
  });

  const todos = Array.from(mapa.values()).sort((a, b) => (b.n - a.n) || (b.criticos - a.criticos));
  todos.forEach(o => {
    o.nombre = Array.from(o.nombres.entries())
      .sort((a, b) => (b[1] - a[1]) || (puntajeNombre(b[0]) - puntajeNombre(a[0])) || (b[0].length - a[0].length))[0][0];
    o.plataforma = esPlataforma(o.clave);
  });
  const clinicos = todos.filter(o => !o.plataforma).slice(0, 10);
  const plataforma = todos.filter(o => o.plataforma).slice(0, 6);

  if (!todos.length){ $("#duele").innerHTML = '<p class="vacio">Sin temas en este periodo.</p>'; return; }

  const tabla = (filas, titulo) => {
    if (!filas.length) return '';
    return (titulo ? '<span class="etiqueta sub">' + titulo + '</span>' : '') +
      '<table class="tabla"><thead><tr><th>Tema</th><th>Menciones</th><th>Nota</th><th>Estado</th></tr></thead><tbody>' +
      filas.map(o => {
        const estado = o.accionados
          ? '<span class="etq lima">con mejora</span>'
          : (o.criticos ? '<span class="etq alerta">sin tocar</span>' : '<span class="mini">sin tocar</span>');
        return '<tr class="pinchable' + (f.tema === o.clave ? ' activa' : '') + '" data-tema="' + o.clave + '" data-nombre="' + escapar(o.nombre) + '" role="button" tabindex="0">' +
          '<td>' + escapar(o.nombre) + '</td>' +
          '<td class="tabular"><b>' + o.n + '</b></td>' +
          '<td class="tabular">' + (o.con ? (o.suma / o.con).toFixed(1) : "—") + '</td>' +
          '<td>' + estado + '</td></tr>';
      }).join("") + '</tbody></table>';
  };

  $("#duele").innerHTML = tabla(clinicos, "") + tabla(plataforma, "Sobre la plataforma") +
    '<p class="mini">Ordenado por menciones, incluidas las búsquedas sin resultado. Clic en una fila para ver esos comentarios abajo.</p>';
}

function pintarComentarios(lista){
  const conTexto = (f.notas.length ? lista.slice() : lista.filter(x => x.texto))
    .sort((a, b) => ((a.estrellas == null ? 9 : a.estrellas) - (b.estrellas == null ? 9 : b.estrellas)) ||
                    (new Date(b.fecha) - new Date(a.fecha)));
  $("#cuenta-comentarios").textContent = lista.filter(x => x.texto).length + " con comentario · " +
    (lista.length === filas.length ? lista.length + " respuestas" : lista.length + " de " + filas.length + " respuestas");
  if (!conTexto.length){
    $("#comentarios").innerHTML = '<p class="vacio">Ninguna respuesta con estos filtros. Prueba con Todo el histórico o quita el filtro de estrellas.</p>';
    return;
  }
  $("#comentarios").innerHTML = conTexto.slice(0, 150).map(tarjetaComentario).join("");
}

function tarjetaComentario(x){
  const etqs = (x.etiquetas || []).map(e => '<span class="etq">' + escapar(nombreEtiqueta(e)) + '</span>').join("");
  const guia = x.guia_de_referencia || x.tema_puntual;
  return '<article class="comentario" style="border-left-color:' + (COLORES[x.estrellas] || "var(--border2)") + '">' +
    '<div class="comentario-meta">' +
      '<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
      '<span class="canal">' + (x.canal === "whatsapp" ? "WhatsApp" : "Web") + '</span>' +
      '<span class="fecha">' + fecha(x.fecha) + (guia ? " · " + escapar(guia) : "") + '</span>' +
      (x.revisado ? '<span class="etq ok">revisado</span>' : '') +
      (x.accionado ? '<span class="etq lima">con mejora</span>' : '') +
    '</div>' +
    (x.mejora ? '<p>' + escapar(x.mejora) + '</p>' : '<p class="mini">Calificó pero no escribió comentario.</p>') +
    (x.tema_puntual && x.tema_puntual !== x.mejora ? '<p class="mini">Tema: ' + escapar(x.tema_puntual) + '</p>' : '') +
    '<div class="comentario-pie">' + etqs +
      '<button class="boton-chico" data-accion="etiquetar" data-id="' + x.id + '">Etiquetar</button>' +
      '<button class="boton-chico" data-accion="revisar" data-id="' + x.id + '">' + (x.revisado ? "Quitar revisado" : "Marcar revisado") + '</button>' +
      '<button class="boton-chico" data-accion="mejora" data-id="' + x.id + '">Convertir en mejora</button>' +
    '</div></article>';
}

/* ============================================================
   5. Acciones sobre un comentario
   ============================================================ */
function alClic(e){
  const b = e.target.closest("button[data-accion]");
  if (!b) return;
  const x = filas.find(r => r.id === b.dataset.id);
  if (!x) return;
  if (b.dataset.accion === "etiquetar") ventanaEtiquetas(x);
  if (b.dataset.accion === "revisar")   alternarRevisado(x, b);
  if (b.dataset.accion === "mejora")    ventanaMejora(x);
}

async function alternarRevisado(x, boton){
  const nuevo = !x.revisado;
  boton.disabled = true;
  const { error } = await sb.from("feedback_triage").upsert({
    feedback_id:  x.id,
    revisado:     nuevo,
    revisado_por: estado.usuario && estado.usuario.id,
    revisado_en:  new Date().toISOString()
  }, { onConflict:"feedback_id" });
  boton.disabled = false;
  if (error){ avisar("No se pudo guardar el revisado.", "mal", "#aviso-panel"); return; }
  x.revisado = nuevo;
  avisar("", "", "#aviso-panel");
  pintar();
}

function ventanaEtiquetas(x){
  const actuales = x.etiquetas || [];
  const cuerpo = '<div class="opciones">' + estado.etiquetas.map(e =>
    '<label class="opcion"><input type="checkbox" value="' + e.clave + '"' +
    (actuales.indexOf(e.clave) > -1 ? " checked" : "") + '>' +
    '<span><b>' + escapar(e.nombre) + '</b><br><span class="mini">' + escapar(e.descripcion || "") + '</span></span></label>'
  ).join("") + '</div>';

  abrirVentana({
    titulo: "Etiquetar comentario",
    guia: x.mejora || x.tema_puntual || "",
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
      await cargar();
    }
  });
}

async function ventanaMejora(x){
  const r = await sb.from("acciones").select("id,numero,titulo")
    .in("estado", ["propuesta", "en_curso"]).order("numero", { ascending:false });
  const abiertas = r.data || [];
  const sugerido = String(x.mejora || x.tema_puntual || "").slice(0, 80);

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
        '<select class="campo" id="m-tipo">' + opciones([["contenido","Contenido"],["producto","Producto"],["proceso","Proceso"],["soporte","Soporte"],["otro","Otro"]], "contenido") + '</select>' +
        '<select class="campo" id="m-prioridad">' + opciones([["alta","Prioridad alta"],["media","Prioridad media"],["baja","Prioridad baja"]], "media") + '</select>' +
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
      await cargar();
    }
  });

  const sel = document.getElementById("m-accion");
  sel.addEventListener("change", () => { document.getElementById("m-nueva").hidden = !!sel.value; });
}

/* ============================================================
   6. Filtro por calificacion (chips y barras del reparto)
   ============================================================ */
function rotuloDe(lista, v){
  const par = lista.find(x => String(x[0]) === String(v));
  return par ? par[1] : String(v);
}

function fichasActivas(){
  const out = [];
  if (f.canal !== "todos") out.push({ campo:"canal", valor:"", txt:"Fuente: " + rotuloDe(CANALES, f.canal) });
  if (f.tipo !== "todos") out.push({ campo:"tipo", valor:"", txt:"Tipo: " + rotuloDe(TIPOS, f.tipo) });
  if (f.foco  !== "todos") out.push({ campo:"foco",  valor:"", txt:rotuloDe(FOCOS, f.foco) });
  f.notas.slice().sort().reverse().forEach(n =>
    out.push({ campo:"nota", valor:n, txt:"Reseña: " + rotuloDe(NOTAS, n) }));
  if (f.etiqueta) out.push({ campo:"etiqueta", valor:"", txt:"Etiqueta: " + nombreEtiqueta(f.etiqueta) });
  if (f.pais) out.push({ campo:"pais", valor:"", txt:"País: " + nombrePais(f.pais) });
  if (f.tema)     out.push({ campo:"tema",     valor:"", txt:"Tema: " + (f.temaNombre || f.tema) });
  if (f.texto)    out.push({ campo:"texto",    valor:"", txt:"Busca: " + f.texto });
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
    f.canal = "todos"; f.tipo = "todos"; f.foco = "todos"; f.etiqueta = ""; f.pais = ""; f.texto = "";
    f.notas = []; f.tema = ""; f.temaNombre = "";
    $("#f-etiqueta").value = "";
    $("#f-pais").value = "";
    $("#f-texto").value = "";
    pintarChips();
  }
  else if (campo === "nota"){ const i = f.notas.indexOf(valor); if (i > -1) f.notas.splice(i, 1); }
  else if (campo === "etiqueta"){ f.etiqueta = ""; $("#f-etiqueta").value = ""; }
  else if (campo === "pais"){ f.pais = ""; $("#f-pais").value = ""; }
  else if (campo === "texto"){ f.texto = ""; $("#f-texto").value = ""; }
  else if (campo === "tema"){ f.tema = ""; f.temaNombre = ""; }
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
   7. Ayudas de presentación
   ============================================================ */
function esBusqueda(x){
  return String(x.origen || "").indexOf("buscador") === 0;
}

const PAISES = { CO:"Colombia", MX:"México", PE:"Perú", ES:"España", CL:"Chile", EC:"Ecuador",
  PA:"Panamá", US:"Estados Unidos", AR:"Argentina", BO:"Bolivia", BR:"Brasil", CR:"Costa Rica",
  DO:"República Dominicana", GT:"Guatemala", HN:"Honduras", NI:"Nicaragua", PY:"Paraguay",
  SV:"El Salvador", UY:"Uruguay", VE:"Venezuela" };

function nombrePais(c){
  const k = String(c || "").toUpperCase();
  return PAISES[k] || k;
}

function colorNota(v){
  if (v == null) return "#8a8a8a";
  if (v < 3.5) return "#d64545";
  if (v < 4.5) return "#2f6fed";
  return "#18a058";
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

function normalizar(s){
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

const PALABRAS_PLATAFORMA = ["plataforma","pagina","app","aplicacion","buscador","busqueda","filtro",
  "precio","pago","pague","suscripcion","costo","tema","temas","protocolo","protocolos","actualizad",
  "letra","color","colores","diseno","interfaz","enredado","entender","lento","carga","sesion","login",
  "clave","correo","notificacion","celular","movil"];

function esPlataforma(clave){
  return PALABRAS_PLATAFORMA.some(p => clave.indexOf(p) > -1);
}
