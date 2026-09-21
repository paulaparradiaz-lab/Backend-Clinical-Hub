/* ============================================================
   CLINICAL HUB · PESTAÑA FEEDBACK
   Análisis del feedback y el paso de un comentario a una mejora.
   Lee public.v_feedback_detalle (feedback + triage + etiquetas + acciones).
   ============================================================ */
import { sb, $, estado, COLORES, escapar, fecha, num, dec, pct, avisar,
         abrirVentana, leer, opcionesEquipo, opciones, nombreEtiqueta } from "./nucleo.js";

let filas = [];
const f = { canal:"todos", dias:90, foco:"todos", etiqueta:"", texto:"", notas:[] };

const CANALES = [["todos","Todo"], ["web","Sitio web"], ["whatsapp","WhatsApp"]];
const RANGOS  = [["30","30 días"], ["90","90 días"], ["365","12 meses"], ["0","Todo el histórico"]];
const FOCOS   = [["todos","Todas"], ["texto","Con comentario"], ["criticos","Críticos 1–2"],
                 ["sin_revisar","Sin revisar"], ["sin_accion","Sin mejora"]];

const NOTAS = [["","Todas"], ["5","5 ★"], ["4","4 ★"], ["3","3 ★"], ["2","2 ★"], ["1","1 ★"], ["0","Sin nota"]];

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
    <div class="filtros" id="f-canal" role="group" aria-label="Canal"></div>
    <div class="filtros" id="f-rango" role="group" aria-label="Periodo"></div>
  </div>
  <div class="filtros-fila">
    <div class="filtros" id="f-foco" role="group" aria-label="Foco"></div>
    <select class="campo compacto" id="f-etiqueta" aria-label="Etiqueta"></select>
    <input class="campo compacto buscador" id="f-texto" type="search" placeholder="Buscar en los comentarios…">
    </div>
    <div class="filtros-fila">
      <div class="filtros" id="f-notas" role="group" aria-label="Calificacion"></div>
  </div>

  <p class="aviso" id="aviso-panel" role="status"></p>

  <div class="tarjetas" id="kpis"></div>

  <div class="rejilla">
    <section class="caja">
      <span class="etiqueta">Cómo se reparten las calificaciones</span><span class="mini">Toca un chip o una barra para filtrar</span>
      <div class="reparto" id="reparto"></div>
    </section>
    <section class="caja">
      <span class="etiqueta">Mes a mes</span>
      <div id="tendencia"></div>
    </section>
  </div>

  <div class="rejilla">
    <section class="caja">
      <span class="etiqueta">Temas etiquetados</span>
      <div id="etiquetas-top"></div>
    </section>
    <section class="caja">
      <span class="etiqueta">Dónde más duele</span>
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
  $("#f-rango").addEventListener("click", e => elegir(e, "dias"));
  $("#f-foco").addEventListener("click",  e => elegir(e, "foco"));
  $("#f-etiqueta").addEventListener("change", e => { f.etiqueta = e.target.value; pintar(); });
  $("#f-texto").addEventListener("input", e => { f.texto = e.target.value.trim().toLowerCase(); pintar(); });
  $("#f-notas").addEventListener("click", e => { const b = e.target.closest("button[data-n]"); if (b) alternarNota(b.dataset.n); });
  $("#reparto").addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) alternarNota(b.dataset.n); });
  $("#btn-recargar").addEventListener("click", () => cargar());
  $("#comentarios").addEventListener("click", alClic);
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
  fila("#f-rango", RANGOS,  String(f.dias));
  fila("#f-foco",  FOCOS,   f.foco);
}

function fila(donde, lista, activo){
  $(donde).innerHTML = lista.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (String(par[0]) === String(activo)) + '">' +
    escapar(par[1]) + '</button>').join("");
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
    if (!omitir && f.notas.length){ const k = x.estrellas == null ? "0" : String(x.estrellas); if (f.notas.indexOf(k) === -1) return false; }
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
  pintarNotas(filtradas(true));
  pintarKpis(lista);
  pintarReparto(lista);
  pintarTendencia(lista);
  pintarEtiquetas(lista);
  pintarDuele(lista);
  pintarComentarios(lista);
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
  const conTexto = lista.filter(x => x.texto);
  const sinRevisar = conTexto.filter(x => !x.revisado).length;
  const accionados = conTexto.filter(x => x.accionado).length;

  $("#kpis").innerHTML =
    tarjeta(prom == null ? "—" : prom.toFixed(2), "Promedio", delta, true) +
    tarjeta(num(notas.length), "Calificaciones", num(lista.length) + " respuestas") +
    tarjeta(num(criticos), "Críticos 1–2", pct(criticos, notas.length) + "% de las notas") +
    tarjeta(num(conTexto.length), "Con comentario", "") +
    tarjeta(num(sinRevisar), "Sin revisar", sinRevisar ? "te están esperando" : "todo al día") +
    tarjeta(pct(accionados, conTexto.length) + "%", "Accionabilidad", num(accionados) + " con mejora");
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
  const cuerpo = meses.map(m => {
    const prom = m.con ? m.suma / m.con : 0;
    const alto = m.con ? Math.max(6, prom / 5 * 100) : 3;
    const color = prom >= 4 ? "var(--s5)" : prom >= 3 ? "var(--s3)" : "var(--s1)";
    const etq = m.mes.slice(5) + "/" + m.mes.slice(2, 4);
    return '<div class="col" title="' + etq + ": " + (m.con ? prom.toFixed(2) : "sin notas") + " · " + m.n + ' respuestas">' +
      '<b class="mini">' + (m.con ? prom.toFixed(1) : "—") + '</b>' +
      '<i style="height:' + alto + '%;background:' + color + '"></i>' +
      '<span>' + etq + '</span></div>';
  }).join("");
  $("#tendencia").innerHTML = '<div class="barras">' + cuerpo + '</div>' +
    '<p class="mini">Promedio de estrellas por mes. Debajo, el mes y el año.</p>';
}

function pintarEtiquetas(lista){
  const mapa = new Map();
  lista.forEach(x => (x.etiquetas || []).forEach(e => {
    const o = mapa.get(e) || { clave:e, n:0, suma:0, con:0, criticos:0, accionados:0 };
    o.n++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
    if (x.accionado) o.accionados++;
    mapa.set(e, o);
  }));
  const top = Array.from(mapa.values()).sort((a, b) => b.n - a.n).slice(0, 10);
  if (!top.length){
    $("#etiquetas-top").innerHTML = '<p class="vacio">Todavía nadie ha etiquetado comentarios en este periodo. Empieza por los críticos.</p>';
    return;
  }
  const tope = top[0].n;
  $("#etiquetas-top").innerHTML = top.map(t =>
    '<div class="fila pinchable" data-etiqueta="' + t.clave + '" role="button" tabindex="0">' +
      '<span class="fila-etq">' + escapar(nombreEtiqueta(t.clave)) + '</span>' +
      '<span class="barra"><span style="width:' + (t.n / tope * 100) + '%;background:' + (t.criticos > t.n / 2 ? "var(--s1)" : "var(--brand)") + '"></span></span>' +
      '<span class="fila-num tabular"><b>' + t.n + '</b> · ' + (t.con ? (t.suma / t.con).toFixed(1) + "★" : "—") + '</span>' +
    '</div>').join("") +
    '<p class="mini">Clic en un tema para filtrar. La barra roja avisa que la mayoría son críticos.</p>';
}

function pintarDuele(lista){
  const mapa = new Map();
  lista.filter(x => x.texto).forEach(x => {
    const k = (x.guia_de_referencia || x.tema_puntual || "Sin guía").trim().slice(0, 60);
    const o = mapa.get(k) || { k:k, n:0, criticos:0, suma:0, con:0, sinAccion:0 };
    o.n++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; if (x.estrellas <= 2) o.criticos++; }
    if (!x.accionado) o.sinAccion++;
    mapa.set(k, o);
  });
  const top = Array.from(mapa.values())
    .sort((a, b) => (b.criticos - a.criticos) || (b.n - a.n)).slice(0, 8);
  if (!top.length){ $("#duele").innerHTML = '<p class="vacio">Sin comentarios en este periodo.</p>'; return; }
  $("#duele").innerHTML = '<table class="tabla"><thead><tr><th>Guía o tema</th><th>Menciones</th><th>Críticos</th><th>Nota</th></tr></thead><tbody>' +
    top.map(t => '<tr><td>' + escapar(t.k) + '</td><td class="tabular">' + t.n + '</td>' +
      '<td class="tabular">' + (t.criticos ? '<span class="etq alerta">' + t.criticos + '</span>' : "—") + '</td>' +
      '<td class="tabular">' + (t.con ? (t.suma / t.con).toFixed(1) : "—") + '</td></tr>').join("") +
    '</tbody></table>';
}

function pintarComentarios(lista){
  const conTexto = lista.filter(x => x.texto)
    .sort((a, b) => ((a.estrellas == null ? 9 : a.estrellas) - (b.estrellas == null ? 9 : b.estrellas)) ||
                    (new Date(b.fecha) - new Date(a.fecha)));
  $("#cuenta-comentarios").textContent = conTexto.length + " comentarios de " + lista.length + " respuestas";
  if (!conTexto.length){
    $("#comentarios").innerHTML = '<p class="vacio">Nada que leer con estos filtros. Prueba con “Todo el histórico”.</p>';
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
    (x.mejora ? '<p>' + escapar(x.mejora) + '</p>' : '<p class="mini">Sin texto libre; solo tema y calificación.</p>') +
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
