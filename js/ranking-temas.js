/* ============================================================
   CLINICAL HUB · RANKING DE TEMAS PEDIDOS (dentro de Métricas)
   Réplica del ranking de la Temas pedidos vieja, sobre los datos
   de la IA. Histórico completo; un único filtro: con / sin mejora.

   Cada fila es un tema del catálogo (categorias_para_ia) con al menos
   un comentario ya clasificado (auto o revisado):
     ✏️  Renombrar   cambia el nombre bonito del tema; el código que
                     usa la IA no cambia y el nombre viejo queda como
                     sinónimo.
     🗑️  Desetiquetar le quita el tema a todos sus comentarios. No
                     borra nada; lo que queda sin clasificar vuelve
                     al Inbox.
     "N formas de decirlo"  abre los comentarios reales; desde ahí se
                     reclasifica o se saca uno del tema.
     Mejora          se crea o se enlaza una mejora (mejoras_ia) al
                     tema completo; se ve y se desvincula sin borrarla.
     Ruido           última fila, en gris: lo descartado como ruido, para
                     reclasificarlo o devolverlo al Inbox si fue un error.
   ============================================================ */
import { $, escapar, fecha, num, pct, abrirVentana, avisar, cerrarVentana, leer,
  traducirError } from "./nucleo.js";
import { catalogo, nombreDe, nombrePais, nombreOrigen, quitarTema, renombrarTema, devolverAlInbox, RUIDO, ESTADOS, nombreEstado,
  crearMejora, enlazarMejora, desvincularMejora, editarMejora } from "./ia.js";
import { ventanaClasificar, textoDe } from "./ia-ventanas.js";

let filas = [];                 // v_ia_feedback ya clasificado
let mejoras = [];               // mejoras_ia
let mejoraDe = new Map();       // tema -> mejora enlazada
let grupos = [];
let verTodos = false;
let qTemas = "";
let recargar = async () => {};
const f = { foco:"todas" };

const FOCOS = [["todas","Todos"], ["sin_accion","Sin mejora"], ["con_accion","Con mejora"]];
const TOPE = 10;

/* Iconos del ranking: el lápiz renombra, la caneca desetiqueta */
const LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16v4z"/>' +
  '<path d="M13.5 6.5l4 4"/></svg>';
const CANECA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 4h4"/>' +
  '<path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

/* Reclasificar lleva la misma etiqueta que Clasificar en el Inbox */
const ETIQUETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/>' +
  '<circle cx="7.5" cy="7.5" r="1.5"/></svg>';

/* ============================================================
   1. Armazón y eventos
   Mismas clases e ids que el ranking viejo (#panel-ranking,
   #f-foco, #ranking, data-tema-accion…) para heredar su CSS.
   ============================================================ */
export function armazon(){
  return `
<section id="panel-ranking">
  <p class="resumen-sub" id="resumen-ranking"></p>
  <div class="filtros-fila">
    <span class="rotulo">Mejora</span>
    <div class="filtros" id="f-foco" role="group" aria-label="Estado de mejora"></div>
  </div>
  <section class="caja" style="margin-top:14px">
    <div class="fila-entre" style="margin-bottom:0">
      <span class="etiqueta">Ranking de temas pedidos</span>
      <button class="enlace-ayuda" id="btn-ayuda-ranking" aria-expanded="false" aria-controls="ayuda-ranking">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
        ¿Cómo funciona?</button>
    </div>
    <div class="ayuda-plegable" id="ayuda-ranking" hidden>
      <p class="mini">Tus temas, ordenados por cuánta gente los pide. Solo aparecen los que ya tienen
      comentarios clasificados; se ven los 10 más pedidos y el botón de abajo muestra todos.</p>
      <p class="mini"><b>El texto subrayado</b> abre los comentarios reales de ese tema; desde ahí puedes
      reclasificar cualquiera o sacarlo del tema. <b>El lápiz</b> cambia el nombre del tema (la IA sigue
      usando el mismo). <b>La caneca</b> le quita el tema a sus comentarios sin borrar nada: lo que queda
      sin clasificar vuelve al Inbox.</p>
      <p class="mini"><b>La mejora</b> se enlaza al tema completo; con Desvincular se la quitas al tema sin
      borrarla. <b>Las referencias</b> son las guías que el médico quiere que se citen.</p>
      <p class="mini"><b>Ruido</b> es la última fila, en gris: lo que se descartó (tú o la IA) porque no decía
      nada aprovechable. Tócala para revisarlo: si algo se descartó por error, lo reclasificas ahí mismo o lo
      devuelves al Inbox. Solo sale con el filtro Todos.</p>
      <p class="mini"><b>El buscador</b> mira el nombre del tema, sus sinónimos y lo que escribieron los
      médicos; escribe "ruido" para encontrar esa fila.</p>
    </div>
    <div class="fila-buscar" style="margin-top:4px">
      <label class="buscador-lupa">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q-ranking" type="search" placeholder="Buscar un tema: sepsis, dengue, falla cardiaca…" aria-label="Buscar en el ranking de temas">
      </label>
    </div>
    <div id="ranking"><p class="vacio">Cargando…</p></div>
  </section>
</section>`;
}

export function conectar(alRecargar){
  recargar = alRecargar;
  verTodos = false;
  qTemas = "";
  pintarChips();
  $("#q-ranking").addEventListener("input", e => { qTemas = e.target.value || ""; pintarRanking(); });
  $("#btn-ayuda-ranking").addEventListener("click", () => {
    const ayuda = $("#ayuda-ranking");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-ranking").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  $("#f-foco").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    f.foco = b.dataset.v;
    pintarChips();
    pintarRanking();
  });
  $("#ranking").addEventListener("click", e => {
    if (e.target.closest("#btn-ver-todos")){ verTodos = !verTodos; pintarRanking(); return; }
    const ver = e.target.closest("button[data-ver]");
    if (ver){ ventanaVerTema(ver.dataset.ver); return; }
    if (e.target.closest("[data-ver-ruido]")){ ventanaVerRuido(); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    if (bt) accionDeTema(bt);
  });
}

function pintarChips(){
  $("#f-foco").innerHTML = FOCOS.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (par[0] === f.foco) + '">' +
    escapar(par[1]) + '</button>').join("");
}

/* ============================================================
   2. Datos
   ============================================================ */
export function pintar(todas, datosMejoras){
  filas = (todas || []).filter(x => x.estado !== "por_revisar");
  mejoras = datosMejoras.mejoras;
  const porId = new Map(mejoras.map(m => [m.id, m]));
  mejoraDe = new Map();
  datosMejoras.enlaces
    .slice().sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
    .forEach(e => { if (!mejoraDe.has(e.tema_slug) && porId.has(e.mejora_id)) mejoraDe.set(e.tema_slug, porId.get(e.mejora_id)); });
  grupos = agrupar();
  pintarRanking();
}

function comentariosDe(slug){
  return filas.filter(x => (x.temas || []).indexOf(slug) > -1);
}

function textoPedido(x){
  return String(x.tema_puntual || x.mejora_texto || "").trim();
}

function agrupar(){
  const mapa = new Map();
  filas.forEach(x => (x.temas || []).forEach(slug => {
    const o = mapa.get(slug) || { slug: slug, n:0, paises:new Set(), formas:new Set(), refs:new Set() };
    o.n++;
    if (x.pais) o.paises.add(x.pais);
    const t = textoPedido(x).toLowerCase();
    if (t) o.formas.add(t);
    const r = String(x.guia_de_referencia || "").trim();
    if (r) o.refs.add(r);
    mapa.set(slug, o);
  }));
  return Array.from(mapa.values()).sort((a, b) => (b.n - a.n) || nombreDe(a.slug).localeCompare(nombreDe(b.slug)));
}

/* ============================================================
   3. Pintado
   ============================================================ */
function pintarRanking(){
  pintarResumen();
  /* El buscador mira el nombre del tema, su código, sus sinónimos y lo
     que escribieron los médicos. Mientras buscas se ven todos los que
     coinciden, no solo los 10 primeros. */
  const busca = qTemas.trim().toLowerCase();
  const lista = grupos.filter(o => {
    if (f.foco === "sin_accion" && mejoraDe.has(o.slug)) return false;
    if (f.foco === "con_accion" && !mejoraDe.has(o.slug)) return false;
    if (busca && buscableTema(o).indexOf(busca) === -1) return false;
    return true;
  });

  if (!grupos.length){
    $("#ranking").innerHTML = '<p class="vacio">Todavía no hay temas clasificados.</p>';
    return;
  }
  if (!lista.length){
    $("#ranking").innerHTML = busca
      ? '<p class="vacio">Ningún tema coincide con “' + escapar(qTemas.trim()) + '”. Prueba con otra palabra.</p>' + filaRuidoSuelta()
      : '<p class="vacio">Ningún tema cumple ese filtro. Prueba con Todos.</p>';
    return;
  }

  const visibles = (verTodos || busca) ? lista : lista.slice(0, TOPE);
  const ocultos = lista.length - visibles.length;

  const cuerpo = visibles.map(o => {
    const clave = escapar(o.slug);
    const cubierto = mejoraDe.has(o.slug);
    const marca = cubierto
      ? '<span class="etq lima">con mejora</span>'
      : '<span class="etq alerta">sin mejora</span>';
    const refs = Array.from(o.refs).join(" / ");
    const formas = o.formas.size;
    const textoFormas = formas > 1 ? formas + " formas de decirlo"
      : (o.n > 1 ? o.n + " comentarios" : "1 comentario");
    const enlace = '<button class="enlace-formas" data-ver="' + clave +
      '" title="Ver los comentarios reales de este tema">' + textoFormas + '</button>';
    const iconos =
      '<button class="icono-btn" data-tema-accion="renombrar" data-clave="' + clave +
      '" title="Renombrar tema" aria-label="Renombrar tema">' + LAPIZ + '</button>' +
      '<button class="icono-btn peligro" data-tema-accion="borrar" data-clave="' + clave +
      '" title="Quitar este tema de sus comentarios" aria-label="Quitar este tema de sus comentarios">' + CANECA + '</button>';
    const botones = cubierto
      ? '<button class="boton-chico" data-tema-accion="vermejora" data-clave="' + clave +
        '" title="Ver mejora">Ver mejora</button> ' +
        '<button class="boton-chico" data-tema-accion="desvincular" data-clave="' + clave +
        '" title="Desvincular mejora">Desvincular</button>'
      : '<button class="boton-chico" data-tema-accion="mejora" data-clave="' + clave +
        '">Crear mejora</button>';
    return '<tr>' +
      '<td><span class="tema-nombre">' + escapar(corto(nombreDe(o.slug), 60)) + iconos + '</span><br>' + enlace + '</td>' +
      '<td class="tabular"><b>' + o.n + '</b></td>' +
      '<td class="tabular">' + o.paises.size + '</td>' +
      '<td><span class="mini">' + (refs ? escapar(corto(refs, 44)) : "—") + '</span></td>' +
      '<td>' + marca + '</td>' +
      '<td>' + botones + '</td></tr>';
  }).join("");

  const alterna = !busca && (lista.length > TOPE || verTodos)
    ? '<button class="boton-chico" id="btn-ver-todos">' +
      (verTodos ? "Ver solo los 10 más pedidos" : "Ver todos los temas (" + lista.length + ")") + '</button>'
    : '';

  $("#ranking").innerHTML =
    '<table class="tabla"><thead><tr><th>Tema</th><th>Piden</th><th>Países</th>' +
    '<th>Referencias que piden</th><th>Mejora</th><th>Acciones</th></tr></thead><tbody>' +
    cuerpo + filaRuido() + '</tbody></table>' + alterna +
    /* Solo el conteo; la explicación vive en "¿Cómo funciona?" */
    (busca ? '<p class="mini">' + plural(lista.length, "tema coincide", "temas coinciden") + ' con “' +
        escapar(qTemas.trim()) + '”</p>' :
      (ocultos > 0 ? '<p class="mini">Se muestran los ' + TOPE + ' más pedidos de ' + lista.length + '</p>' : ''));
}

function pintarResumen(){
  const res = $("#resumen-ranking");
  if (!res) return;
  const conMej = grupos.filter(o => mejoraDe.has(o.slug)).length;
  const conTema = filas.filter(x => (x.temas || []).length).length;
  res.innerHTML = "<b>" + num(grupos.length) + "</b> temas pedidos · <b>" +
    num(conTema) + "</b> comentarios clasificados · <b>" + (grupos.length ? pct(conMej, grupos.length) : 0) +
    "%</b> con mejora (" + num(conMej) + " de " + num(grupos.length) + ")";
}

/* ============================================================
   4. Acciones del ranking
   ============================================================ */
function accionDeTema(bt){
  const slug = bt.dataset.clave;
  const accion = bt.dataset.temaAccion;
  if (accion === "renombrar") ventanaRenombrar(slug);
  if (accion === "borrar") ventanaDesetiquetar(slug);
  if (accion === "mejora") ventanaMejora(slug);
  if (accion === "vermejora") ventanaVerMejora(slug);
  if (accion === "desvincular") ventanaDesvincular(slug);
}

async function trasCambio(texto){
  avisar(texto, "ok", "#aviso-panel");
  await recargar();
}

/* ✏️ Renombrar: solo el nombre bonito */
function ventanaRenombrar(slug){
  const actual = nombreDe(slug);
  abrirVentana({
    titulo: "Renombrar tema",
    guia: actual,
    cuerpo:
      '<input class="campo" id="r-nombre" value="' + escapar(actual) + '">' +
      '<p class="mini">Cambia solo el nombre que ves en el panel. La IA sigue clasificando con el mismo ' +
      'código del tema (' + escapar(slug) + '), así que lo que ya llegó y lo que llegue después se queda ' +
      'junto aquí. El nombre viejo se guarda como sinónimo para que la IA lo siga reconociendo.</p>',
    aceptar: "Guardar nombre",
    alAceptar: async () => {
      const nuevo = leer("r-nombre");
      if (!nuevo){ avisar("Escribe el nombre nuevo.", "mal", "#aviso-forma"); return false; }
      if (nuevo === actual){ return; }
      await renombrarTema(slug, nuevo);
      cerrarVentana();
      await trasCambio("Tema renombrado: “" + nuevo + "”.");
      return false;
    }
  });
}

/* 🗑️ Desetiquetar: quita el tema de todos sus comentarios */
function ventanaDesetiquetar(slug){
  const lista = comentariosDe(slug);
  const vuelven = lista.filter(x => (x.temas || []).length === 1 && !(x.mejoras || []).length).length;
  abrirVentana({
    titulo: "Quitar tema",
    guia: nombreDe(slug) + " · " + plural(lista.length, "comentario", "comentarios"),
    cuerpo:
      '<p>¿Quitar “' + escapar(nombreDe(slug)) + '” de sus ' + plural(lista.length, "comentario", "comentarios") + '?</p>' +
      '<p class="mini">No se borra ningún comentario ni el tema del catálogo: la IA lo puede seguir usando. ' +
      'Los que tenían otros temas los conservan.' +
      (vuelven ? ' <b>' + plural(vuelven, "comentario se queda", "comentarios se quedan") +
        ' sin clasificar y vuelve' + (vuelven === 1 ? '' : 'n') + ' al Inbox</b> para que lo reclasifiques.' : '') +
      '</p>',
    aceptar: "Quitar tema",
    alAceptar: async () => {
      await quitarTema(lista, slug);
      cerrarVentana();
      await trasCambio("“" + nombreDe(slug) + "” quitado de " + plural(lista.length, "comentario", "comentarios") +
        (vuelven ? " · " + vuelven + " volvieron al Inbox" : "") + ".");
      return false;
    }
  });
}

/* "N formas de decirlo": los comentarios reales del tema */
/* ============================================================
   Ruido: lo que se descartó (tú o la IA) como "no dice nada útil".
   Va como última fila del ranking, en gris, para poder revisarlo y
   rescatar lo que se haya descartado por error.
   ============================================================ */
function catalogoTema(slug){
  return catalogo.temas.find(c => c.slug === slug);
}

function comentariosRuido(){
  return filas.filter(x => (x.mejoras || []).indexOf(RUIDO) > -1);
}

function buscableTema(o){
  const cat = catalogoTema(o.slug);
  return [nombreDe(o.slug), o.slug, cat ? cat.sinonimos : "", Array.from(o.formas).join(" ")].join(" ").toLowerCase();
}

/* La fila de Ruido también responde al buscador ("ruido") */
function filaRuido(){
  const lista = comentariosRuido();
  const busca = qTemas.trim().toLowerCase();
  if (!lista.length || f.foco !== "todas") return "";
  if (busca && "ruido descartado".indexOf(busca) === -1) return "";
  const paises = new Set(lista.map(x => x.pais).filter(Boolean)).size;
  const texto = lista.length === 1 ? "1 comentario" : lista.length + " comentarios";
  return '<tr class="fila-ruido">' +
    '<td><span class="tema-nombre">Ruido</span><br>' +
      '<button class="enlace-formas" data-ver-ruido title="Ver lo que se descartó como ruido">' + texto + '</button></td>' +
    '<td class="tabular"><b>' + lista.length + '</b></td>' +
    '<td class="tabular">' + paises + '</td>' +
    '<td><span class="mini">Descartados: no decían nada aprovechable</span></td>' +
    '<td><span class="etq">descartado</span></td>' +
    '<td><button class="boton-chico" data-ver-ruido>Revisar</button></td></tr>';
}

function filaRuidoSuelta(){
  const fila = filaRuido();
  return fila ? '<table class="tabla"><tbody>' + fila + '</tbody></table>' : '';
}

function ventanaVerRuido(){
  const lista = comentariosRuido().slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  abrirVentana({
    titulo: "Ruido",
    guia: plural(lista.length, "comentario descartado", "comentarios descartados"),
    cuerpo:
      '<p class="mini">Lo que se marcó como ruido, tal cual llegó. Si algo se descartó por error, ' +
      'reclasifícalo aquí mismo o devuélvelo al Inbox.</p>' +
      '<div class="lista-chat" style="max-height:58vh;overflow:auto">' +
      (lista.length ? lista.map(tarjetaRuido).join("") : '<p class="vacio">No hay nada en ruido.</p>') +
      '</div>',
    aceptar: "Cerrar",
    ancha: true,
    alAceptar: async () => {}
  });
  const cancelar = document.querySelector("#velo-forma [data-cerrar]");
  if (cancelar) cancelar.hidden = true;
  const caja = document.querySelector("#velo-forma .lista-chat");
  if (!caja) return;
  caja.addEventListener("click", async e => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const x = lista.find(p => String(p.id) === b.dataset.id);
    if (!x) return;
    if (b.dataset.accion === "reclasificar"){
      ventanaClasificar([x], () => trasCambio("Comentario reclasificado: ya no está en ruido."));
      return;
    }
    if (b.dataset.accion === "devolver"){
      b.disabled = true;
      try {
        await devolverAlInbox([x]);
        cerrarVentana();
        await trasCambio("Devuelto al Inbox para clasificarlo de nuevo.");
      } catch (err){
        b.disabled = false;
        avisar(traducirError(err && err.message), "mal", "#aviso-forma");
      }
    }
  });
}

function tarjetaRuido(x){
  const id = escapar(String(x.id));
  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
    '<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
    '<span class="canal">' + escapar(nombreOrigen(x.origen)) + '</span>' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    '</div>' +
    textoDe(x) +
    '<div class="comentario-pie">' +
    '<button class="boton-chico" data-accion="reclasificar" data-id="' + id + '">' + ETIQUETA + 'Reclasificar</button>' +
    /* El Inbox solo muestra lo que tiene texto: sin texto, solo se reclasifica */
    ([x.mejora_texto, x.tema_puntual, x.guia_de_referencia].some(t => String(t || "").trim())
      ? '<button class="boton-chico" data-accion="devolver" data-id="' + id + '">Devolver al Inbox</button>' : '') +
    '</div></article>';
}

function ventanaVerTema(slug){
  const lista = comentariosDe(slug).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const formas = new Set(lista.map(x => textoPedido(x).toLowerCase()).filter(Boolean)).size;
  abrirVentana({
    titulo: nombreDe(slug),
    guia: plural(lista.length, "comentario", "comentarios") + " · " + plural(formas, "forma de decirlo", "formas de decirlo"),
    cuerpo:
      '<p class="mini">Lo que escribió cada médico, tal cual llegó. Puedes mandar cualquiera a otros ' +
      'temas o sacarlo de este.</p>' +
      /* .lista-chat: la misma lista en estilo chat del Inbox */
      '<div class="lista-chat" style="max-height:58vh;overflow:auto">' +
      (lista.length ? lista.map(x => tarjetaVer(x, slug)).join("") : '<p class="vacio">Sin comentarios.</p>') +
      '</div>',
    aceptar: "Cerrar",
    ancha: true,
    alAceptar: async () => {}
  });
  /* Solo se mira: sobra el Cancelar al lado de Cerrar */
  const cancelar = document.querySelector("#velo-forma [data-cerrar]");
  if (cancelar) cancelar.hidden = true;
  const caja = document.querySelector("#velo-forma .lista-chat");
  if (!caja) return;
  caja.addEventListener("click", async e => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const x = lista.find(p => String(p.id) === b.dataset.id);
    if (!x) return;
    if (b.dataset.accion === "reclasificar"){
      ventanaClasificar([x], () => trasCambio("Comentario reclasificado."));
      return;
    }
    if (b.dataset.accion === "quitar"){
      b.disabled = true;
      try {
        await quitarTema([x], slug);
        cerrarVentana();
        const vuelve = (x.temas || []).length === 1 && !(x.mejoras || []).length;
        await trasCambio("Comentario sacado de “" + nombreDe(slug) + "”" + (vuelve ? " · volvió al Inbox" : "") + ".");
      } catch (err){
        b.disabled = false;
        avisar(traducirError(err && err.message), "mal", "#aviso-forma");
      }
    }
  });
}

function tarjetaVer(x, slug){
  const otros = (x.temas || []).filter(t => t !== slug);
  const id = escapar(String(x.id));
  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
    '<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
    '<span class="canal">' + escapar(nombreOrigen(x.origen)) + '</span>' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    '</div>' +
    '<p>' + escapar(textoPedido(x) || "Sin texto") + '</p>' +
    (x.guia_de_referencia ? '<p class="mini">Referencias que pide: ' + escapar(x.guia_de_referencia) + '</p>' : '') +
    (x.tema_puntual && x.mejora_texto ? '<p class="mini">También comentó: ' + escapar(x.mejora_texto) + '</p>' : '') +
    (otros.length ? '<p class="mini">También cuenta en: ' +
      otros.map(t => '<span class="etq">' + escapar(nombreDe(t)) + '</span>').join(" ") + '</p>' : '') +
    '<div class="comentario-pie">' +
    '<button class="boton-chico" data-accion="reclasificar" data-id="' + id + '">' + ETIQUETA + 'Reclasificar</button>' +
    '<button class="boton-chico" data-accion="quitar" data-id="' + id + '">Quitar de este tema</button>' +
    '</div></article>';
}

/* Crear mejora: nueva, o enlazar a una que ya existe */
function ventanaMejora(slug){
  const n = comentariosDe(slug).length;
  const sugerido = nombreDe(slug).slice(0, 80);
  abrirVentana({
    titulo: "Mejora del tema",
    guia: sugerido + " · " + plural(n, "comentario", "comentarios"),
    cuerpo:
      '<p class="mini">La mejora queda enlazada a este tema completo. Hoy lo piden ' + plural(n, "comentario", "comentarios") +
      ', y los que lleguen después quedan cubiertos igual.</p>' +
      '<span class="etiqueta">A qué mejora pertenece</span>' +
      '<select class="campo" id="m-mejora">' +
      '<option value="">Crear una mejora nueva</option>' +
      mejoras.map(m => '<option value="' + m.id + '">#' + m.id + ' · ' + escapar(m.titulo) +
        ' · ' + escapar(nombreEstado(m.estado)) + '</option>').join("") +
      '</select>' +
      '<p class="mini">Si este tema es otra forma de decir algo que ya estás trabajando, elige la mejora ' +
      'que ya existe y el tema queda enlazado a ella.</p>' +
      '<div id="m-nueva">' +
      '<input class="campo" id="m-titulo" placeholder="Título de la mejora" value="' + escapar(sugerido) + '">' +
      '<textarea class="campo" id="m-detalle" placeholder="Qué vamos a cambiar y por qué"></textarea>' +
      '</div>',
    aceptar: "Guardar",
    ancha: true,
    alAceptar: async () => {
      let id = leer("m-mejora");
      if (!id){
        const titulo = leer("m-titulo");
        if (!titulo){ avisar("Ponle un título a la mejora.", "mal", "#aviso-forma"); return false; }
        id = await crearMejora(titulo, leer("m-detalle"));
      }
      await enlazarMejora(Number(id), slug);
      cerrarVentana();
      await trasCambio("Mejora enlazada a “" + nombreDe(slug) + "”.");
      return false;
    }
  });
  const sel = document.getElementById("m-mejora");
  sel.addEventListener("change", () => { document.getElementById("m-nueva").hidden = !!sel.value; });
}

/* 👁 Ver mejora: sus datos, editables, y los temas que atiende */
function ventanaVerMejora(slug){
  const m = mejoraDe.get(slug);
  if (!m){ ventanaMejora(slug); return; }
  abrirVentana({
    titulo: "Mejora #" + m.id,
    guia: "Creada el " + fecha(m.creado_en) + " · enlazada a " + nombreDe(slug),
    cuerpo:
      '<span class="etiqueta">Título</span>' +
      '<input class="campo" id="v-titulo" value="' + escapar(m.titulo) + '">' +
      '<span class="etiqueta">Detalle</span>' +
      '<textarea class="campo" id="v-detalle" placeholder="Qué vamos a cambiar y por qué">' + escapar(m.detalle || "") + '</textarea>' +
      '<span class="etiqueta">Estado</span>' +
      '<select class="campo" id="v-estado">' + ESTADOS.map(e =>
        '<option value="' + e[0] + '"' + (e[0] === m.estado ? " selected" : "") + '>' + e[1] + '</option>').join("") +
      '</select>' +
      '<p class="mini">Una mejora no se borra: si ya no va, ponla en Descartada y la historia se conserva.</p>',
    aceptar: "Guardar cambios",
    ancha: true,
    alAceptar: async () => {
      const titulo = leer("v-titulo");
      if (!titulo){ avisar("La mejora necesita un título.", "mal", "#aviso-forma"); return false; }
      await editarMejora(m.id, { titulo: titulo, detalle: leer("v-detalle"), estado: leer("v-estado") || m.estado });
      cerrarVentana();
      await trasCambio("Mejora #" + m.id + " actualizada.");
      return false;
    }
  });
}

/* Desvincular: le quita la mejora al tema, sin borrarla */
function ventanaDesvincular(slug){
  const m = mejoraDe.get(slug);
  if (!m) return;
  abrirVentana({
    titulo: "Desvincular mejora",
    guia: nombreDe(slug),
    cuerpo:
      '<p>¿Quitarle la mejora “' + escapar(m.titulo) + '” a “' + escapar(nombreDe(slug)) + '”?</p>' +
      '<p class="mini">La mejora no se borra y sigue enlazada a sus otros temas, si tiene. El tema ' +
      'vuelve a quedar sin mejora.</p>',
    aceptar: "Desvincular",
    alAceptar: async () => {
      await desvincularMejora(m.id, slug);
      cerrarVentana();
      await trasCambio("Mejora desvinculada de “" + nombreDe(slug) + "”.");
      return false;
    }
  });
}

/* ============================================================
   5. Ayudas
   ============================================================ */
function plural(n, uno, varios){
  return num(n) + " " + (n === 1 ? uno : varios);
}

function corto(s, n){
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

