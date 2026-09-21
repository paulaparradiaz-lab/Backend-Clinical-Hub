/* ============================================================
   CLINICAL HUB · PESTAÑA MEJORAS
   La hoja de vida de la plataforma: qué cambiamos, por qué feedback
   lo cambiamos, quién lo hizo y qué pasó con las notas después.
   Lee public.v_hoja_de_vida y public.v_tareas_detalle.
   ============================================================ */
import { sb, $, estado, escapar, fecha, fechaCorta, num, dec, pct, avisar,
         abrirVentana, leer, opcionesEquipo, opciones, cargarCatalogos } from "./nucleo.js";

let acciones = [];
let tareas   = [];
const f = { estado:"todas", responsable:"" };

const ESTADOS = [["todas","Todas"], ["propuesta","Propuestas"], ["en_curso","En curso"],
                 ["entregada","Entregadas"], ["descartada","Descartadas"]];
const NOMBRE_ESTADO = { propuesta:"Propuesta", en_curso:"En curso", entregada:"Entregada", descartada:"Descartada" };
const TIPOS = [["contenido","Contenido"], ["producto","Producto"], ["proceso","Proceso"],
               ["soporte","Soporte"], ["otro","Otro"]];
const PRIORIDADES = [["alta","Prioridad alta"], ["media","Prioridad media"], ["baja","Prioridad baja"]];

/* ============================================================
   1. Armazón
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
      <div class="mast"><span class="etiqueta">Hoja de vida de la plataforma</span><h1>Mejoras</h1></div>
      <p>Cada mejora nace de un feedback concreto. Aquí se ve qué cambió y cuándo.</p>
    </div>
    <div class="filtros">
      <button class="boton-chico" id="btn-persona">+ Persona</button>
      <button class="boton-chico activo" id="btn-nueva">+ Nueva mejora</button>
    </div>
  </div>

  <p class="aviso" id="aviso-panel" role="status"></p>

  <div class="tarjetas" id="kpis"></div>

  <section class="caja comentarios">
    <div class="fila-entre">
      <span class="etiqueta">Tareas abiertas</span>
      <select class="campo compacto" id="f-responsable" aria-label="Responsable"></select>
    </div>
    <div id="tareas"><p class="vacio">Cargando…</p></div>
  </section>

  <div class="filtros-fila">
    <div class="filtros" id="f-estado" role="group" aria-label="Estado de la mejora"></div>
  </div>

  <div id="acciones"><p class="vacio">Cargando…</p></div>
`;
}

function conectar(){
  pintarChips();
  $("#f-estado").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    f.estado = b.dataset.v;
    pintarChips();
    pintarAcciones();
  });
  $("#f-responsable").addEventListener("change", e => { f.responsable = e.target.value; pintarTareas(); });
  $("#btn-nueva").addEventListener("click", () => ventanaMejora(null));
  $("#btn-persona").addEventListener("click", ventanaPersona);
  $("#tareas").addEventListener("click", alClicTarea);
  $("#acciones").addEventListener("click", alClicAccion);
}

function pintarChips(){
  $("#f-estado").innerHTML = ESTADOS.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (par[0] === f.estado) + '">' +
    escapar(par[1]) + '</button>').join("");
  $("#f-responsable").innerHTML = '<option value="">Todo el equipo</option>' +
    estado.equipo.map(p => '<option value="' + p.id + '"' + (p.id === f.responsable ? " selected" : "") + '>' +
      escapar(p.nombre) + '</option>').join("");
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  const [a, t] = await Promise.all([
    sb.from("v_hoja_de_vida").select("*"),
    sb.from("v_tareas_detalle").select("*").order("creada_en", { ascending:false })
  ]);
  if (a.error){
    $("#acciones").innerHTML = '<p class="vacio">No se pudieron leer las mejoras. ' + escapar(a.error.message) + '</p>';
    return;
  }
  acciones = (a.data || []).sort((x, y) =>
    new Date(y.entregada_en || y.creada_en) - new Date(x.entregada_en || x.creada_en));
  tareas = t.data || [];
  pintarKpis();
  pintarTareas();
  pintarAcciones();
}

/* ============================================================
   3. Indicadores
   ============================================================ */
function pintarKpis(){
  const entregadas = acciones.filter(a => a.estado === "entregada");
  const enCurso    = acciones.filter(a => a.estado === "en_curso");
  const propuestas = acciones.filter(a => a.estado === "propuesta");
  const abiertas   = tareas.filter(t => t.abierta);
  const vencidas   = tareas.filter(t => t.vencida);
  const cerradas   = tareas.filter(t => t.dias_en_cerrar != null);
  const medio = cerradas.length
    ? cerradas.reduce((s, t) => s + Number(t.dias_en_cerrar), 0) / cerradas.length : null;
  const evidencias = acciones.reduce((s, a) => s + Number(a.evidencias || 0), 0);

  $("#kpis").innerHTML =
    tarjeta(num(entregadas.length), "Mejoras entregadas", "desde que existe el panel", true) +
    tarjeta(num(enCurso.length), "En curso", num(propuestas.length) + " propuestas") +
    tarjeta(num(abiertas.length), "Tareas abiertas", vencidas.length ? vencidas.length + " vencidas" : "ninguna vencida") +
    tarjeta(medio == null ? "—" : dec(medio, 1), "Días en cerrar", "promedio por tarea") +
    tarjeta(num(evidencias), "Feedbacks atendidos", "comentarios que ya movieron algo");
}

function tarjeta(cifra, etiqueta, extra, lima){
  return '<div class="dato"><div class="cifra tabular' + (lima ? " lima" : "") + '">' + cifra + '</div>' +
    '<span class="etiqueta">' + escapar(etiqueta) + '</span>' +
    (extra ? '<span class="mini">' + escapar(extra) + '</span>' : '') + '</div>';
}

/* ============================================================
   4. Tareas
   ============================================================ */
function pintarTareas(){
  const orden = { alta:0, media:1, baja:2 };
  const lista = tareas
    .filter(t => t.abierta)
    .filter(t => !f.responsable || t.responsable_id === f.responsable)
    .sort((a, b) => (b.vencida - a.vencida) ||
                    (orden[a.prioridad] - orden[b.prioridad]) ||
                    (new Date(a.vence_el || "2999-01-01") - new Date(b.vence_el || "2999-01-01")));
  if (!lista.length){
    $("#tareas").innerHTML = '<p class="vacio">No hay tareas abiertas. Cuando conviertas un comentario en mejora, aparecen aquí.</p>';
    return;
  }
  $("#tareas").innerHTML = lista.map(filaTarea).join("");
}

function filaTarea(t){
  return '<div class="tarea' + (t.estado === "hecha" ? " hecha" : "") + '">' +
    '<button class="tick" data-tarea="' + t.id + '" aria-pressed="' + (t.estado === "hecha") +
      '" title="Marcar como hecha">' + (t.estado === "hecha" ? "✓" : "") + '</button>' +
    '<div class="tarea-txt">' +
      '<b>' + escapar(t.titulo) + '</b>' +
      (t.detalle ? '<p class="mini">' + escapar(t.detalle) + '</p>' : '') +
      '<p class="mini">' +
        (t.accion_numero ? 'mejora #' + t.accion_numero + ' · ' : '') +
        (t.responsable ? escapar(t.responsable) : "sin asignar") +
        (t.vence_el ? ' · vence ' + fechaCorta(t.vence_el) : '') +
        (t.vencida ? ' <span class="etq alerta">vencida</span>' : '') +
        (t.prioridad === "alta" ? ' <span class="etq alerta">alta</span>' : '') +
      '</p>' +
    '</div></div>';
}

async function alClicTarea(e){
  const b = e.target.closest("button[data-tarea]");
  if (!b) return;
  const t = tareas.find(x => x.id === b.dataset.tarea);
  if (!t) return;
  b.disabled = true;
  const nuevo = t.estado === "hecha" ? "pendiente" : "hecha";
  const r = await sb.from("tareas").update({ estado: nuevo }).eq("id", t.id);
  b.disabled = false;
  if (r.error){ avisar("No se pudo actualizar la tarea.", "mal", "#aviso-panel"); return; }
  avisar("", "", "#aviso-panel");
  await cargar();
}

/* ============================================================
   5. Hoja de vida
   ============================================================ */
function pintarAcciones(){
  const lista = acciones.filter(a => f.estado === "todas" || a.estado === f.estado);
  if (!lista.length){
    $("#acciones").innerHTML = '<p class="vacio">Todavía no hay mejoras registradas con este filtro. ' +
      'Ve a Feedback, busca un comentario crítico y usa “Convertir en mejora”.</p>';
    return;
  }
  $("#acciones").innerHTML = lista.map(tarjetaAccion).join("");
}

function tarjetaAccion(a){
  const misTareas = tareas.filter(t => t.accion_id === a.id);
  const avance = a.tareas ? pct(a.tareas_hechas, a.tareas) : null;
  let impacto = "";
  if (a.promedio_antes != null && a.promedio_despues != null){
    const d = Number(a.promedio_despues) - Number(a.promedio_antes);
    impacto = '<p class="mini">Notas 45 días antes y después de entregar: ' +
      dec(a.promedio_antes, 2) + ' → ' + dec(a.promedio_despues, 2) +
      ' <span class="delta ' + (d >= 0 ? "sube" : "baja") + '">' + (d >= 0 ? "▲" : "▼") + " " + Math.abs(d).toFixed(2) + '</span></p>';
  } else if (a.estado === "entregada"){
    impacto = '<p class="mini">Sin notas suficientes todavía para medir el impacto.</p>';
  }

  return '<article class="accion" data-id="' + a.id + '">' +
    '<div class="fila-entre">' +
      '<span class="etiqueta">mejora #' + a.numero + ' · ' + escapar(a.tipo) + '</span>' +
      '<span class="etq ' + (a.estado === "entregada" ? "lima" : a.estado === "descartada" ? "" : "ok") + '">' +
        escapar(NOMBRE_ESTADO[a.estado] || a.estado) + '</span>' +
    '</div>' +
    '<h3>' + escapar(a.titulo) + '</h3>' +
    (a.descripcion ? '<p>' + escapar(a.descripcion) + '</p>' : '') +
    '<p class="mini">' +
      (a.responsable ? escapar(a.responsable) : "sin responsable") +
      ' · abierta ' + fechaCorta(a.creada_en) +
      (a.entregada_en ? ' · entregada ' + fechaCorta(a.entregada_en) : '') +
      (a.prioridad === "alta" ? ' · <span class="etq alerta">prioridad alta</span>' : '') +
    '</p>' +
    (a.impacto_esperado ? '<p class="mini">Esperábamos: ' + escapar(a.impacto_esperado) + '</p>' : '') +
    (a.resultado ? '<p class="mini">Resultado: ' + escapar(a.resultado) + '</p>' : '') +
    (avance != null
      ? '<div class="fila"><span class="fila-etq">tareas</span>' +
        '<span class="barra"><span style="width:' + avance + '%;background:var(--brand)"></span></span>' +
        '<span class="fila-num tabular"><b>' + a.tareas_hechas + '</b> de ' + a.tareas + '</span></div>'
      : '') +
    (misTareas.length ? '<div class="tareas-accion">' + misTareas.map(filaTarea).join("") + '</div>' : '') +
    '<p class="mini">' + num(a.evidencias) + ' feedback' + (Number(a.evidencias) === 1 ? "" : "s") + ' de origen' +
      (a.voces ? ': <span class="voces">' + escapar(String(a.voces).slice(0, 300)) + '</span>' : '') + '</p>' +
    impacto +
    '<div class="comentario-pie">' +
      '<button class="boton-chico" data-op="tarea" data-id="' + a.id + '">+ Tarea</button>' +
      '<button class="boton-chico" data-op="estado" data-id="' + a.id + '">Cambiar estado</button>' +
      '<button class="boton-chico" data-op="editar" data-id="' + a.id + '">Editar</button>' +
    '</div></article>';
}

function alClicAccion(e){
  const tick = e.target.closest("button[data-tarea]");
  if (tick) return alClicTarea(e);
  const b = e.target.closest("button[data-op]");
  if (!b) return;
  const a = acciones.find(x => x.id === b.dataset.id);
  if (!a) return;
  if (b.dataset.op === "tarea")  ventanaTarea(a);
  if (b.dataset.op === "estado") ventanaEstado(a);
  if (b.dataset.op === "editar") ventanaMejora(a);
}

/* ============================================================
   6. Ventanas
   ============================================================ */
function ventanaMejora(a){
  const cuerpo =
    '<input class="campo" id="a-titulo" placeholder="Título de la mejora" value="' + escapar(a ? a.titulo : "") + '">' +
    '<textarea class="campo" id="a-desc" placeholder="Qué vamos a cambiar y por qué">' + escapar(a && a.descripcion ? a.descripcion : "") + '</textarea>' +
    '<div class="campos">' +
      '<select class="campo" id="a-tipo">' + opciones(TIPOS, a ? a.tipo : "contenido") + '</select>' +
      '<select class="campo" id="a-prioridad">' + opciones(PRIORIDADES, a ? a.prioridad : "media") + '</select>' +
    '</div>' +
    '<select class="campo" id="a-resp">' + opcionesEquipo(a ? a.responsable_id : null) + '</select>' +
    '<input class="campo" id="a-impacto" placeholder="Qué esperamos que mejore" value="' + escapar(a && a.impacto_esperado ? a.impacto_esperado : "") + '">';

  abrirVentana({
    titulo: a ? "Editar mejora #" + a.numero : "Nueva mejora",
    guia: a ? "" : "Sirve para mejoras que no nacen de un comentario puntual.",
    cuerpo: cuerpo,
    ancha: true,
    alAceptar: async () => {
      const titulo = leer("a-titulo");
      if (!titulo){ avisar("Ponle un título.", "mal", "#aviso-forma"); return false; }
      const campos = {
        titulo: titulo,
        descripcion: leer("a-desc"),
        tipo: leer("a-tipo") || "contenido",
        prioridad: leer("a-prioridad") || "media",
        responsable_id: leer("a-resp"),
        impacto_esperado: leer("a-impacto")
      };
      const r = a
        ? await sb.from("acciones").update(campos).eq("id", a.id)
        : await sb.from("acciones").insert(Object.assign(campos, { creada_por: estado.usuario && estado.usuario.id }));
      if (r.error) throw r.error;
      await cargar();
    }
  });
}

function ventanaEstado(a){
  const cuerpo =
    '<span class="etiqueta">Estado</span>' +
    '<select class="campo" id="e-estado">' + opciones([["propuesta","Propuesta"],["en_curso","En curso"],["entregada","Entregada"],["descartada","Descartada"]], a.estado) + '</select>' +
    '<span class="etiqueta">Qué pasó</span>' +
    '<textarea class="campo" id="e-resultado" placeholder="Qué se hizo y qué resultado dio">' + escapar(a.resultado || "") + '</textarea>';
  abrirVentana({
    titulo: "Mejora #" + a.numero,
    guia: a.titulo,
    cuerpo: cuerpo,
    aceptar: "Guardar",
    alAceptar: async () => {
      const r = await sb.from("acciones")
        .update({ estado: leer("e-estado") || a.estado, resultado: leer("e-resultado") })
        .eq("id", a.id);
      if (r.error) throw r.error;
      await cargar();
    }
  });
}

function ventanaTarea(a){
  const cuerpo =
    '<input class="campo" id="t-titulo" placeholder="Qué hay que hacer">' +
    '<textarea class="campo" id="t-detalle" placeholder="Detalle (opcional)"></textarea>' +
    '<div class="campos">' +
      '<select class="campo" id="t-resp">' + opcionesEquipo(a.responsable_id) + '</select>' +
      '<select class="campo" id="t-prioridad">' + opciones(PRIORIDADES, "media") + '</select>' +
    '</div>' +
    '<input class="campo" id="t-vence" type="date">';
  abrirVentana({
    titulo: "Nueva tarea",
    guia: "Mejora #" + a.numero + " · " + a.titulo,
    cuerpo: cuerpo,
    alAceptar: async () => {
      const titulo = leer("t-titulo");
      if (!titulo){ avisar("Escribe qué hay que hacer.", "mal", "#aviso-forma"); return false; }
      const r = await sb.from("tareas").insert({
        accion_id: a.id,
        titulo: titulo,
        detalle: leer("t-detalle"),
        responsable_id: leer("t-resp"),
        prioridad: leer("t-prioridad") || "media",
        vence_el: leer("t-vence"),
        creada_por: estado.usuario && estado.usuario.id
      });
      if (r.error) throw r.error;
      await cargar();
    }
  });
}

function ventanaPersona(){
  const cuerpo =
    '<input class="campo" id="p-nombre" placeholder="Nombre">' +
    '<input class="campo" id="p-correo" type="email" placeholder="Correo (opcional)">' +
    '<p class="mini">Esto solo la agrega a la lista de responsables. Para que entre al panel, ' +
    'hay que crearle usuario en Supabase.</p>';
  abrirVentana({
    titulo: "Agregar persona al equipo",
    cuerpo: cuerpo,
    alAceptar: async () => {
      const nombre = leer("p-nombre");
      if (!nombre){ avisar("Escribe el nombre.", "mal", "#aviso-forma"); return false; }
      const r = await sb.from("equipo").insert({ nombre: nombre, correo: leer("p-correo") });
      if (r.error) throw r.error;
      await cargarCatalogos();
      pintarChips();
      await cargar();
    }
  });
}
