/* ============================================================
   CLINICAL HUB · FEEDBACK › MÉTRICAS
   El tablero: todo histórico, sin selector de fechas.

   ESTRELLAS   Promedio de estrellas por mes, en chupetes con la nota,
               la ★ y cuántas reseñas, sobre un área sombreada del
               color de cada nivel.
   TEMAS       El ranking de temas pedidos de la Temas vieja, con sus
               mejoras y acciones (vive en ranking-temas.js).
   MEJORAS     Los tipos de mejora técnica, con su promedio de estrellas.

   Los rankings cuentan solo lo ya clasificado (auto o revisado): lo
   que la IA dejó por revisar vive en el Inbox y suma aquí en cuanto
   se clasifica. Las estrellas cuentan todas, porque la nota del
   médico no depende de la clasificación.

   Lee public.v_ia_feedback, public.v_ia_mejoras, mejoras_ia y
   mejora_ia_tema.
   ============================================================ */
import { sb, $, COLORES, escapar, num, pct, traducirError } from "./nucleo.js";
import { RUIDO, cargarCatalogo, cargarMejoras } from "./ia.js";
import * as rankingTemas from "./ranking-temas.js";

/* ============================================================
   1. Armazón de la subpestaña (vive dentro de Feedback)
   ============================================================ */
export async function render(caja){
  caja.innerHTML = armazon();
  rankingTemas.conectar(cargar);
  await cargar();
}

export function recargar(){ return cargar(); }

function armazon(){
  return `
<p class="aviso" id="aviso-panel" role="status"></p>
<p class="resumen-sub" id="resumen-metricas"></p>

<section class="caja" style="margin-top:14px">
  <span class="etiqueta">Ranking de estrellas</span><span class="mini">Promedio de estrellas por mes</span>
  <div id="tendencia"><p class="vacio">Cargando…</p></div>
</section>

${rankingTemas.armazon()}

<section class="caja" style="margin-top:16px">
  <span class="etiqueta">Ranking de mejoras técnicas</span><span class="mini">Cuántas veces sale cada tipo y su nota promedio</span>
  <div id="mejoras-top"><p class="vacio">Cargando…</p></div>
</section>
`;
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  let fb, mj, datosMejoras;
  try {
    [fb, mj, datosMejoras] = await Promise.all([
      sb.from("v_ia_feedback").select("*"),
      sb.from("v_ia_mejoras").select("*").order("veces", { ascending:false }),
      cargarMejoras(),
      cargarCatalogo()
    ]);
    const error = fb.error || mj.error;
    if (error) throw error;
  } catch (err){
    const aviso = '<p class="vacio">No se pudieron leer las métricas. ' + escapar(traducirError(err && err.message)) + '</p>';
    ["#tendencia", "#ranking", "#mejoras-top"].forEach(s => { $(s).innerHTML = aviso; });
    return;
  }
  pintarResumen(fb.data || []);
  pintarEstrellas(fb.data || []);
  rankingTemas.pintar(fb.data || [], datosMejoras);
  pintarMejoras(mj.data || []);
}

function pintarResumen(filas){
  const notas = filas.filter(x => x.estrellas != null);
  const prom = notas.length ? notas.reduce((a, x) => a + x.estrellas, 0) / notas.length : null;
  /* Misma regla que v_ia_por_revisar: solo cuenta lo que tiene texto */
  const pendientes = filas.filter(x => x.estado === "por_revisar" &&
    [x.tema_puntual, x.mejora_texto, x.guia_de_referencia].some(t => String(t || "").trim())).length;
  /* Si algo volvió al Inbox (por ejemplo, al quitar un tema), el globito se entera */
  document.dispatchEvent(new CustomEvent("ch-pendientes", { detail: pendientes }));
  $("#resumen-metricas").innerHTML = "<b>" + num(filas.length) + "</b> feedbacks · <b>" +
    (prom == null ? "—" : prom.toFixed(2).replace(".", ",")) + "</b> estrellas de promedio con " +
    num(notas.length) + " calificaciones" +
    (pendientes ? " · <b>" + num(pendientes) + "</b> en el Inbox, sin sumar todavía" : "");
}

/* ============================================================
   3. Ranking de estrellas: chupetes por mes
   Cada mes es una bolita con un palito punteado fino hasta la base, con
   la nota, la ★ y cuántas reseñas encima. Debajo, un área sombreada
   que une los meses en línea recta, del color de cada nivel.
   ============================================================ */
function porMes(filas){
  const mapa = new Map();
  filas.forEach(x => {
    if (!x.fecha) return;
    const m = String(x.fecha).slice(0, 7);
    const o = mapa.get(m) || { mes:m, n:0, suma:0, con:0, notas:{ 1:0, 2:0, 3:0, 4:0, 5:0 } };
    o.n++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; o.notas[x.estrellas]++; }
    mapa.set(m, o);
  });
  return Array.from(mapa.values()).sort((a, b) => a.mes < b.mes ? -1 : 1);
}

let ultimasFilas = null;
let esperaAncho = null;
window.addEventListener("resize", () => {
  clearTimeout(esperaAncho);
  esperaAncho = setTimeout(() => {
    if (ultimasFilas && $("#tendencia") && $("#tendencia .lineas")) pintarEstrellas(ultimasFilas);
  }, 150);
});

function pintarEstrellas(filas){
  const meses = porMes(filas);
  if (!meses.length){ $("#tendencia").innerHTML = '<p class="vacio">Todavía no hay calificaciones.</p>'; return; }

  const puntos = meses.map((m, i) => ({ i: i, mes: m.mes, n: m.n, con: m.con, notas: m.notas, prom: m.con ? m.suma / m.con : null }));
  const conValor = puntos.filter(p => p.prom != null);
  /* Se dibuja al ancho real de la caja (no se estira): así las letras
     miden lo mismo que el resto del panel, en computador y en celular.
     Si cambia el ancho de la pantalla, se vuelve a dibujar. */
  ultimasFilas = filas;
  const W = Math.max(280, Math.round($("#tendencia").clientWidth || 720), puntos.length * 64);
  const H = 210, ix = 34, dx = 18, ay = 50, ab = 34;   // ay: aire para la nota y las reseñas sobre la bolita de 5
  const ancho = W - ix - dx, alto = H - ay - ab;
  const margen = 36;   // los chupetes no se pegan al eje ni al borde
  const px = i => puntos.length === 1 ? ix + ancho / 2 : ix + margen + (i / (puntos.length - 1)) * (ancho - 2 * margen);
  const py = v => ay + (5 - v) / 4 * alto;

  let s = '<svg class="lineas" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Promedio de estrellas por mes">';
  [5, 4, 3, 2, 1].forEach(v => {
    s += '<line class="guia" x1="' + ix + '" y1="' + py(v) + '" x2="' + (W - dx) + '" y2="' + py(v) + '"></line>';
    s += '<text class="eje" x="' + (ix - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + '</text>';
  });
  s += '<line class="base" x1="' + ix + '" y1="' + py(1) + '" x2="' + (W - dx) + '" y2="' + py(1) + '"></line>';

  /* Área sombreada bajo los meses con nota, unidos en línea recta. El
     color va de un mes al otro según su nivel (rojo, amarillo, azul,
     verde), en un degradado de izquierda a derecha. */
  if (conValor.length > 1){
    const x0 = px(conValor[0].i), x1 = px(conValor[conValor.length - 1].i);
    s += '<defs><linearGradient id="area-niveles" gradientUnits="userSpaceOnUse" x1="' + x0 + '" y1="0" x2="' + x1 + '" y2="0">' +
      conValor.map(p => '<stop offset="' + ((px(p.i) - x0) / (x1 - x0)) + '" stop-color="' + colorNota(p.prom) + '"></stop>').join("") +
      '</linearGradient></defs>';
    s += '<path class="area" fill="url(#area-niveles)" d="M' + x0 + ' ' + py(1) + ' ' +
      conValor.map(p => 'L' + px(p.i) + ' ' + py(p.prom)).join(' ') + ' L' + x1 + ' ' + py(1) + 'Z"></path>';
  }
  const R = 8;
  puntos.forEach(p => {
    const x = px(p.i);
    if (p.prom == null){
      s += '<g class="punto"><circle class="punto-vacio" cx="' + x + '" cy="' + py(1) + '" r="3"></circle>' +
        '<title>' + etqMes(p.mes) + ': sin calificaciones, ' + p.n + ' feedbacks</title></g>';
    } else {
      const c = colorNota(p.prom);
      const fiesta = p.prom >= 4.5;
      s += '<g class="punto' + (fiesta ? ' festeja' : '') + '" data-i="' + p.i + '" tabindex="0">';
      s += '<line class="tallo fino" x1="' + x + '" y1="' + py(1) + '" x2="' + x + '" y2="' + (py(p.prom) + R) + '" stroke="' + c + '"></line>';
      if (fiesta) s += '<circle class="aura" cx="' + x + '" cy="' + py(p.prom) + '" r="9" fill="' + c + '"></circle>';
      s += '<circle class="bolita" cx="' + x + '" cy="' + py(p.prom) + '" r="' + R + '" fill="' + c + '"></circle>';
      s += '<text class="valor" x="' + x + '" y="' + (py(p.prom) - R - 19) + '" text-anchor="middle" fill="' + c + '">' +
        p.prom.toFixed(1).replace(".", ",") + ' ★</text>';
      s += '<text class="cuantas" x="' + x + '" y="' + (py(p.prom) - R - 6) + '" text-anchor="middle">' +
        num(p.con) + (p.con === 1 ? ' reseña' : ' reseñas') + '</text>';
      s += '</g>';
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
  $("#tendencia").innerHTML = s + '<div class="globo-mes" id="globo-mes" role="tooltip" hidden></div>' + fiesta +
    '<div class="leyenda-notas">' + NIVELES.map(n =>
      '<span><i style="background:' + colorNota(n[2]) + '"></i>' + n[0] + ' <b>' + n[1] + '</b></span>').join("") + '</div>';
  conectarGlobo(puntos);
}

/* Globito del chupete: al pasar el mouse (o tocarlo en el celular)
   dice cuántas calificaciones hubo de cada estrella ese mes y el total. */
function conectarGlobo(puntos){
  const caja = $("#tendencia");
  const globo = $("#globo-mes");
  function mostrar(g){
    const p = puntos[Number(g.dataset.i)];
    if (!p) return;
    const tope = Math.max(1, ...[1, 2, 3, 4, 5].map(n => p.notas[n]));
    globo.innerHTML =
      '<div class="globo-mes-cab"><b>' + etqMes(p.mes) + '</b><span style="color:' + colorNota(p.prom) + '">' +
        p.prom.toFixed(1).replace(".", ",") + ' ★ promedio</span></div>' +
      [5, 4, 3, 2, 1].map(n =>
        '<div class="globo-mes-fila"><span>' + n + ' ★</span>' +
        '<span class="globo-mes-barra"><i style="width:' + (p.notas[n] / tope * 100) + '%;background:' + COLORES[n] + '"></i></span>' +
        '<b>' + num(p.notas[n]) + '</b><small>' + pct(p.notas[n], p.con) + '%</small></div>').join("") +
      '<div class="globo-mes-total">Total: <b>' + num(p.con) + '</b> ' + (p.con === 1 ? "calificación" : "calificaciones") +
        (p.n > p.con ? ' · ' + num(p.n) + ' feedbacks en el mes' : '') + '</div>';
    globo.hidden = false;
    const base = caja.getBoundingClientRect();
    const b = g.querySelector(".bolita").getBoundingClientRect();
    const x = b.left + b.width / 2 - base.left;
    const ancho = globo.offsetWidth;
    globo.style.left = Math.max(0, Math.min(x - ancho / 2, base.width - ancho)) + "px";
    /* Encima de la bolita; si no cabe (chupetes altos), debajo */
    const arriba = b.top - base.top - globo.offsetHeight - 10;
    globo.style.top = (arriba >= 0 ? arriba : b.bottom - base.top + 10) + "px";
  }
  function ocultar(){ globo.hidden = true; }
  caja.querySelectorAll(".punto[data-i]").forEach(g => {
    g.addEventListener("mouseenter", () => mostrar(g));
    g.addEventListener("mouseleave", ocultar);
    g.addEventListener("focus", () => mostrar(g));
    g.addEventListener("blur", ocultar);
    g.addEventListener("click", () => globo.hidden ? mostrar(g) : ocultar());
  });
}

/* ============================================================
   5. Ranking de mejoras técnicas
   Barras como las de Tipo de problema. Ruido va en gris al final:
   se cuenta, pero no es una mejora que haya que hacer.
   ============================================================ */
function pintarMejoras(lista){
  if (!lista.length){
    $("#mejoras-top").innerHTML = '<p class="vacio">Todavía no hay mejoras clasificadas.</p>';
    return;
  }
  const orden = lista.filter(m => m.slug !== RUIDO).concat(lista.filter(m => m.slug === RUIDO));
  const tope = Math.max(1, ...lista.map(m => m.veces));
  $("#mejoras-top").innerHTML = orden.map(m => {
    const color = m.slug === RUIDO ? "var(--border2)"
      : (m.promedio_estrellas != null && m.promedio_estrellas < 3 ? "var(--s1)" : "var(--brand)");
    return '<div class="fila">' +
      '<span class="fila-etq">' + escapar(m.nombre) + '</span>' +
      '<span class="barra"><span style="width:' + (m.veces / tope * 100) + '%;background:' + color + '"></span></span>' +
      '<span class="fila-num tabular"><b>' + num(m.veces) + '</b> · ' +
        (m.promedio_estrellas != null ? Number(m.promedio_estrellas).toFixed(1) + "★" : "—") + '</span>' +
    '</div>';
  }).join("") +
  '<p class="mini">La cifra es cuántas veces sale y la estrella, la nota promedio de quienes la señalan. ' +
  'La barra roja avisa que ese tipo viene con nota baja (menos de 3). Ruido va en gris: se cuenta, ' +
  'pero no es una mejora por hacer.</p>';
}

/* ============================================================
   6. Ayudas de presentación
   ============================================================ */
/* Cuatro niveles: excelente, muy bien, regular y malo. NIVELES arma la
   leyenda: nombre, rango y un valor de muestra para sacar su color. */
const NIVELES = [["Excelente", "4.5 a 5", 4.75], ["Muy bien", "4 a 4.5", 4.25],
                 ["Regular", "3.5 a 4", 3.75], ["Malo", "menos de 3.5", 3]];

function colorNota(v){
  if (v == null) return "#8a8a8a";
  if (v < 3.5) return "#dc4a3d";
  if (v < 4) return "#e5a117";
  if (v < 4.5) return "#2f6fed";
  return "#1fa15a";
}

function etqMes(m){
  return String(m).slice(5) + "/" + String(m).slice(2, 4);
}
