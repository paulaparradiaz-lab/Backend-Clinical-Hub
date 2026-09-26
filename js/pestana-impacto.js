/* ============================================================
   CLINICAL HUB · PESTAÑA IMPACTO (panel nuevo)
   ¿Bajaron las críticas después de cada mejora? Una tarjeta por cada
   indicador (mejora global: lo que dicen de toda la plataforma), con
   todas las mejoras que impactan en él puestas sobre su línea de tiempo:

   GRÁFICA      Críticas por semana del indicador (cuántos comentarios
                clasificados caen en él), las últimas 12 semanas, en el
                color del indicador (el mismo de la tarjeta en Mejoras).
   MEJORAS      Sobre la gráfica: una raya con su número el día en que
                se completó cada una, y una franja suave desde que
                empezó cada una que sigue en curso.
   RESULTADO    Debajo, cada mejora con su porcentaje: críticas por
                semana después de completarla contra las de antes, en
                ventanas del mismo largo (hasta 6 semanas por lado).

   La fecha que manda es completada_en de la mejora (se pone sola al
   completarla y se puede escribir a mano para mejoras del pasado).
   Lee v_ia_feedback, mejoras_ia, mejora_ia_tema y mejora_ia_historial
   (las fechas de cada estado, que anota Supabase solo).
   ============================================================ */
import { sb, $, escapar, fechaCorta, num, avisar, traducirError } from "./nucleo.js";
import { catalogo, cargarCatalogo, cargarMejoras, nombreDe, nombreEstado, RUIDO, colorIndicador } from "./ia.js";
import { ventanaComentarios, plural } from "./ia-ventanas.js";

const SEMANAS = 12;
const VENTANA = 42;               // días que se comparan a cada lado, como máximo
const DIA = 864e5;
const ICONO_INDICADOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>';

let filas = [];                   // v_ia_feedback ya clasificado
let indicadores = [];

/* ============================================================
   1. Armazón
   ============================================================ */
export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Lo que cambió después de cada mejora</span><h1>Impacto</h1></div>
    <p>Cada indicador con sus críticas en el tiempo y las mejoras que se le hicieron.</p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<p class="aviso" id="aviso-panel" role="status"></p>
<p class="resumen-sub" id="resumen-impacto"></p>

<section class="caja" style="margin-top:14px">
  <div class="fila-entre cabeza-seccion">
    <div><h2 class="titulo-seccion">Críticas y mejoras por indicador</h2><p class="subtitulo-seccion">Las últimas 12 semanas</p></div>
    <button class="enlace-ayuda" id="btn-ayuda-impacto" aria-expanded="false" aria-controls="ayuda-impacto">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      ¿Cómo funciona?</button>
  </div>
  <div class="ayuda-plegable" id="ayuda-impacto" hidden>
    <p class="mini">Cada tarjeta es un <b>indicador</b>: una mejora global, lo que dicen los médicos de toda la
    plataforma. <b>La línea</b> son sus críticas por semana en las últimas 12 semanas: cuántos comentarios
    cayeron ahí. Pasa el mouse por la línea para ver cada semana.</p>
    <p class="mini"><b>Las mejoras</b> de ese indicador se ven sobre la línea: una <b>raya con su número</b> el día
    en que se completó, y una <b>franja suave</b> desde que empezó la que sigue en curso. Así se ve qué mejora
    coincidió con cada bajada.</p>
    <p class="mini"><b>Debajo</b> va cada mejora con su resultado: las críticas por semana <b>después</b> de
    completarla contra las de <b>antes</b>, con los mismos días a cada lado (hasta 6 semanas). En lima si
    bajaron, en rojo si subieron. Necesita al menos una semana después de completarla. La fecha es la de
    «Completada el», que puedes escribir a mano si se hizo antes, por fuera del sistema.</p>
    <p class="mini"><b>«Ver comentarios»</b> abre lo que escribieron los médicos sobre ese indicador.</p>
  </div>
  <div id="impacto-indicadores" class="impacto-indicadores"><p class="vacio">Cargando…</p></div>
</section>`;

  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try { await cargar(); } finally { b.classList.remove("girando"); }
  });
  $("#btn-ayuda-impacto").addEventListener("click", () => {
    const ayuda = $("#ayuda-impacto");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-impacto").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  $("#impacto-indicadores").addEventListener("click", e => {
    const b = e.target.closest("[data-comentarios]");
    if (b) abrirComentarios(indicadores[Number(b.dataset.comentarios)]);
  });

  await cargar();
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  let fb, hist, datos;
  try {
    [fb, hist, datos] = await Promise.all([
      sb.from("v_ia_feedback").select("*"),
      sb.from("mejora_ia_historial").select("mejora_id, estado, cambiado_en").order("cambiado_en"),
      cargarMejoras(),
      cargarCatalogo()
    ]);
    if (fb.error) throw fb.error;
    if (hist.error) throw hist.error;
  } catch (err){
    if (!$("#impacto-indicadores")) return;
    $("#impacto-indicadores").innerHTML = '<p class="vacio">No se pudo leer el impacto. ' +
      escapar(traducirError(err && err.message)) + '</p>';
    return;
  }
  if (!$("#impacto-indicadores")) return;
  filas = (fb.data || []).filter(x => x.estado !== "por_revisar");

  /* Fechas de cada mejora: la última vez que entró a cada estado. La
     de completada escrita en la mejora manda sobre el historial. */
  const fechas = new Map();
  (hist.data || []).forEach(h => {
    const o = fechas.get(h.mejora_id) || {};
    o[h.estado] = new Date(h.cambiado_en);
    fechas.set(h.mejora_id, o);
  });
  const fechasDe = m => {
    const f = Object.assign({ pendiente: new Date(m.creado_en) }, fechas.get(m.id) || {});
    if (m.completada_en) f.hecha = new Date(m.completada_en);
    return f;
  };

  const fin = Date.now();
  indicadores = catalogo.mejoras.filter(c => c.slug !== RUIDO).map(c => {
    const lista = filas.filter(x => (x.mejoras || []).indexOf(c.slug) > -1);
    const dias = lista.map(x => new Date(x.fecha).getTime()).filter(t => !isNaN(t));
    const ids = new Set(datos.enlaces.filter(e => e.tema_slug === c.slug).map(e => e.mejora_id));
    const mejoras = datos.mejoras
      .filter(m => ids.has(m.id) && m.estado !== "descartada")
      .map(m => medir(m, fechasDe(m), dias, fin))
      .sort((a, b) => fechaOrden(b) - fechaOrden(a));
    return { slug: c.slug, lista: lista, dias: dias, mejoras: mejoras, semanas: porSemana(dias, fin) };
  })
  /* Primero los que tienen mejoras; luego los más criticados */
  .sort((a, b) => (Math.min(b.mejoras.length, 1) - Math.min(a.mejoras.length, 1)) || (b.lista.length - a.lista.length));
  pintar();
}

/* Semanas que terminan hoy: la última es la de los últimos 7 días */
function porSemana(dias, fin){
  return Array.from({ length: SEMANAS }, (_, i) => {
    const hasta = fin - (SEMANAS - 1 - i) * 7 * DIA;
    const desde = hasta - 7 * DIA;
    return { desde: desde, hasta: hasta, n: dias.filter(t => t > desde && t <= hasta).length };
  });
}

/* El resultado de una mejora en su indicador: antes y después de completarla */
function medir(m, f, dias, fin){
  const r = { mejora: m, fechas: f, medible: false };
  if (m.estado !== "hecha" || !f.hecha) return r;
  const t = f.hecha.getTime();
  const largo = Math.min(VENTANA, (fin - t) / DIA);
  r.diasDespues = Math.max(0, Math.floor((fin - t) / DIA));
  if (largo >= 7){
    const antes = dias.filter(d => d >= t - largo * DIA && d < t).length;
    const despues = dias.filter(d => d >= t && d <= t + largo * DIA).length;
    r.antes = antes / (largo / 7);
    r.despues = despues / (largo / 7);
    r.semanasComparadas = Math.round(largo / 7);
    r.medible = true;
  }
  return r;
}

/* Para ordenar: lo más reciente primero (completadas por su fecha, las
   demás por cuándo empezaron) */
function fechaOrden(r){
  const f = r.fechas;
  return (f.hecha || f.en_curso || f.pendiente || new Date(0)).getTime();
}

/* ============================================================
   3. Pintado
   ============================================================ */
function pintar(){
  const conMejoras = indicadores.filter(o => o.mejoras.length).length;
  const medidas = indicadores.reduce((s, o) => s + o.mejoras.filter(r => r.medible).length, 0);
  const bajaron = indicadores.reduce((s, o) => s + o.mejoras.filter(r => r.medible && r.antes > 0 && r.despues < r.antes).length, 0);
  $("#resumen-impacto").innerHTML = "<b>" + num(indicadores.length) + "</b> indicadores · <b>" + num(conMejoras) +
    "</b> con mejoras · <b>" + num(medidas) + "</b> mejoras ya medibles · en <b>" + num(bajaron) + "</b> bajaron las críticas";

  if (!indicadores.length){
    $("#impacto-indicadores").innerHTML = '<p class="vacio">Todavía no hay indicadores. Créalos con «Nueva etiqueta» ' +
      'en el ranking de mejoras globales de Feedback › Métricas.</p>';
    return;
  }
  $("#impacto-indicadores").innerHTML = indicadores.map(tarjeta).join("");
}

function tarjeta(o, i){
  const color = colorIndicador(o.slug);
  const numero = new Map(o.mejoras.map(r => [r.mejora.id, r]));
  return '<article class="impacto-indicador" style="--c:' + color + '">' +
    '<div class="impacto-indicador-cab">' +
      '<span class="indicador-item">' + ICONO_INDICADOR + '<b>' + escapar(nombreDe(o.slug)) + '</b></span>' +
      '<span class="mini">' + plural(o.lista.length, "crítica", "críticas") + ' · ' +
        plural(o.mejoras.length, "mejora", "mejoras") + '</span>' +
      '<button class="enlace-formas" data-comentarios="' + i + '">Ver comentarios</button>' +
    '</div>' +
    grafica(o) +
    (o.mejoras.length
      ? '<ul class="impacto-mejoras">' + o.mejoras.map(renglon).join("") + '</ul>'
      : '<p class="mini impacto-sin">Sin mejoras todavía. Crea una en la pestaña Mejoras con este indicador.</p>') +
  '</article>';
}

/* Cada mejora del indicador con su resultado */
function renglon(r){
  const m = r.mejora;
  let resultado, clase = "espera";
  if (r.medible && r.antes === 0){
    resultado = r.despues ? "+" + num(Math.round(r.despues * 10) / 10) + " por semana" : "Sin críticas";
    clase = r.despues ? "sube" : "";
  } else if (r.medible){
    const cambio = Math.round((r.despues - r.antes) / r.antes * 100);
    resultado = (cambio > 0 ? "+" : "") + cambio + "%";
    clase = cambio < 0 ? "baja" : cambio > 0 ? "sube" : "";
  } else if (m.estado === "hecha"){
    resultado = "Midiendo";
  } else {
    resultado = nombreEstado(m.estado);
  }
  const cuando = m.estado === "hecha" && r.fechas.hecha
    ? "completada el " + fechaCorta(r.fechas.hecha) +
      (r.medible ? " · " + plural(r.semanasComparadas, "semana", "semanas") + " a cada lado"
                 : " · se compara desde los 7 días")
    : m.estado === "en_curso" && r.fechas.en_curso ? "en curso desde el " + fechaCorta(r.fechas.en_curso)
    : "se mide cuando se complete";
  return '<li>' +
    '<span class="impacto-num">' + m.id + '</span>' +
    '<span class="impacto-txt"><b>' + escapar(m.titulo) + '</b><small>' + cuando + '</small></span>' +
    '<span class="impacto-res ' + clase + '">' + resultado + '</span>' +
  '</li>';
}

/* Críticas por semana y, encima, las mejoras: raya numerada al
   completarse y franja desde que empezó la que sigue en curso */
function grafica(o){
  const w = 640, h = 170, izq = 26, der = 12, arr = 30, abj = 24;
  const tope = Math.max(3, ...o.semanas.map(s => s.n));
  const x = i => izq + i * (w - izq - der) / (SEMANAS - 1);
  const y = v => h - abj - v / tope * (h - arr - abj);
  const t0 = o.semanas[0].hasta, t1 = o.semanas[SEMANAS - 1].hasta;
  const xFecha = t => izq + (t - t0) / (t1 - t0) * (w - izq - der);
  const dentro = t => t >= t0 && t <= t1;

  const pasos = [0, Math.round(tope / 2), tope].filter((v, i, a) => a.indexOf(v) === i);
  const ejes = pasos.map(v => '<line class="' + (v ? "guia" : "base") + '" x1="' + izq + '" x2="' + (w - der) + '" y1="' + y(v) +
      '" y2="' + y(v) + '"/><text class="eje" x="' + (izq - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>').join("") +
    o.semanas.map((s, i) => i % 3 === 0 || i === SEMANAS - 1
      ? '<text class="eje" x="' + x(i) + '" y="' + (h - 6) + '" text-anchor="middle">' + fechaCorta(new Date(s.hasta)) + '</text>' : '').join("");

  /* Franjas de las que siguen en curso */
  const franjas = o.mejoras.filter(r => r.mejora.estado === "en_curso").map(r => {
    const desde = Math.max(t0, (r.fechas.en_curso || r.fechas.pendiente).getTime());
    const x0 = xFecha(desde);
    return '<rect class="franja" x="' + x0 + '" y="' + arr + '" width="' + Math.max(4, w - der - x0) + '" height="' + (h - arr - abj) + '">' +
      '<title>#' + r.mejora.id + ' ' + escapar(r.mejora.titulo) + ' · en curso</title></rect>';
  }).join("");

  /* Rayas de las completadas; si dos quedan muy juntas, la etiqueta sube */
  let ultima = -99, nivel = 0;
  const rayas = o.mejoras.filter(r => r.mejora.estado === "hecha" && r.fechas.hecha && dentro(r.fechas.hecha.getTime()))
    .sort((a, b) => a.fechas.hecha - b.fechas.hecha)
    .map(r => {
      const px = xFecha(r.fechas.hecha.getTime());
      nivel = px - ultima < 30 ? (nivel + 1) % 2 : 0;
      ultima = px;
      const cy = 12;
      const cx = px + (nivel ? 16 : 0);
      return '<g class="hito"><title>#' + r.mejora.id + ' ' + escapar(r.mejora.titulo) + ' · completada el ' +
          fechaCorta(r.fechas.hecha) + '</title>' +
        '<line x1="' + px + '" x2="' + px + '" y1="' + (arr - 6) + '" y2="' + (h - abj) + '"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="10"/><text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">' +
          r.mejora.id + '</text></g>';
    }).join("");

  const d = o.semanas.map((s, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s.n).toFixed(1)).join(" ");
  const puntos = o.semanas.map((s, i) =>
    '<g><rect x="' + (x(i) - 12) + '" y="' + arr + '" width="24" height="' + (h - arr - abj) + '" fill="transparent">' +
      '<title>Semana al ' + fechaCorta(new Date(s.hasta)) + ': ' + plural(s.n, "crítica", "críticas") + '</title></rect>' +
    '<circle class="punto" cx="' + x(i) + '" cy="' + y(s.n) + '" r="3.5" pointer-events="none"/></g>').join("");

  return '<svg class="impacto-grafica" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Críticas por semana de ' +
      escapar(nombreDe(o.slug)) + ' y sus mejoras">' +
    ejes + franjas +
    '<path class="area" d="' + d + ' L ' + x(SEMANAS - 1) + ' ' + y(0) + ' L ' + x(0) + ' ' + y(0) + ' Z"/>' +
    '<path class="trazo" d="' + d + '"/>' + puntos + rayas +
  '</svg>';
}

/* «Ver comentarios»: lo que escribieron sobre ese indicador */
function abrirComentarios(o){
  if (!o) return;
  ventanaComentarios({
    titulo: nombreDe(o.slug),
    guia: plural(o.lista.length, "comentario", "comentarios"),
    intro: "Lo que escribió cada médico sobre esto, tal cual llegó. Si alguno no es de aquí, reclasifícalo o devuélvelo al Inbox.",
    lista: o.lista.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    alCambiar: async texto => { avisar(texto, "ok", "#aviso-panel"); await cargar(); }
  });
}
