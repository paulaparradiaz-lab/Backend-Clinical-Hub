/* ============================================================
   CLINICAL HUB · PESTAÑA HITOS
   La hoja de vida del proyecto como línea de tiempo. Los hitos no se
   crean a mano: salen solos de cuatro métricas y se desbloquean cuando
   el número llega a su escalón. La fecha de cada uno sale de los datos
   (el día en que llegó la calificación número 25, por ejemplo), así la
   línea cuenta la historia completa desde el principio.
   Lee v_resenas, accion_tema, v_hoja_de_vida y metricas_negocio
   (esta última la llena n8n; ver sql/metricas_negocio.sql).
   ============================================================ */
import { sb, $, escapar, fecha, num, pct } from "./nucleo.js";

/* ============================================================
   1. Las cuatro métricas y sus escalones
   ============================================================ */
const usd = n => "US$ " + num(n);

const SERIES = [
  { clave:"cinco", nombre:"Calificaciones de 5 ★",
    escalones:[10, 25, 50, 100, 250, 500],
    titulo: n => num(n) + " calificaciones de 5 ★",
    sentido:"Médicos que calificaron una guía con la nota más alta",
    valor: n => num(n) },
  { clave:"temas", nombre:"Temas entregados",
    escalones:"decenas",
    titulo: n => num(n) + " temas entregados",
    sentido:"Temas del ranking de Temas pedidos con su mejora ya entregada",
    valor: n => num(n) },
  { clave:"suscriptores", nombre:"Suscriptores acumulados",
    escalones:[10, 50, 100, 250, 500, 1000],
    titulo: n => num(n) + " suscriptores",
    sentido:"Total histórico de suscriptores, llega desde n8n",
    valor: n => num(n) },
  { clave:"facturacion", nombre:"Facturación acumulada",
    escalones:"unoCinco",
    titulo: n => usd(n) + " facturados",
    sentido:"Facturación acumulada en dólares, llega desde n8n",
    valor: n => usd(n) }
];

/* ============================================================
   2. Armazón
   ============================================================ */
export async function render(){
  $("#vista").innerHTML = `
  <div class="cabecera">
    <div>
      <div class="mast"><span class="etiqueta">Hoja de vida del proyecto</span><h1>Hitos</h1></div>
      <p>Se desbloquean solos a medida que el proyecto crece.</p>
    </div>
  </div>
  <div class="tarjetas" id="kpis"></div>
  <section class="caja hitos-caja">
    <span class="etiqueta">Línea de tiempo</span>
    <div id="linea-hitos"><p class="vacio">Cargando…</p></div>
  </section>
`;
  await cargar();
}

/* ============================================================
   3. Datos: cada métrica queda como su valor actual y una forma
   de saber en qué fecha se cruzó cada escalón.
   ============================================================ */
async function cargar(){
  const [cinco, enlaces, mejoras, negocio] = await Promise.all([
    sb.from("v_resenas").select("fecha").eq("estrellas", 5).order("fecha", { ascending:true }),
    sb.from("accion_tema").select("accion_id,tema_id"),
    sb.from("v_hoja_de_vida").select("id,estado,entregada_en"),
    sb.from("metricas_negocio").select("*").order("fecha", { ascending:true })
  ]);
  if (cinco.error || enlaces.error || mejoras.error){
    const e = cinco.error || enlaces.error || mejoras.error;
    $("#linea-hitos").innerHTML = '<p class="vacio">No se pudieron leer los datos. ' + escapar(e.message) + '</p>';
    return;
  }

  const datos = {
    cinco: conteo((cinco.data || []).map(x => x.fecha)),
    temas: conteo(fechasTemasEntregados(enlaces.data || [], mejoras.data || [])),
    // Sin tabla o sin filas todavía: n8n aún no está conectado
    suscriptores: negocio.error ? null : acumulado(negocio.data || [], "suscriptores_acumulados"),
    facturacion:  negocio.error ? null : acumulado(negocio.data || [], "facturacion_acumulada_usd")
  };
  pintar(datos);
}

/* Un tema cuenta como entregado el día en que se entregó la primera
   mejora enlazada a él. */
function fechasTemasEntregados(enlaces, mejoras){
  const entregada = new Map(mejoras.filter(a => a.estado === "entregada").map(a => [a.id, a.entregada_en]));
  const porTema = new Map();
  enlaces.forEach(e => {
    if (!entregada.has(e.accion_id)) return;
    const f = entregada.get(e.accion_id);
    const antes = porTema.get(e.tema_id);
    if (!porTema.has(e.tema_id) || (f && (!antes || f < antes))) porTema.set(e.tema_id, f);
  });
  return Array.from(porTema.values());
}

/* Métricas que se cuentan (una fecha por unidad): el escalón N se
   cruzó en la fecha de la unidad número N. */
function conteo(fechas){
  const orden = fechas.slice().sort((a, b) => (a ? new Date(a) : Infinity) - (b ? new Date(b) : Infinity));
  return { actual: orden.length, fechaDe: n => orden[n - 1] || null };
}

/* Métricas que llegan como foto diaria del acumulado: el escalón se
   cruzó el primer día en que el acumulado llegó a él. */
function acumulado(filas, campo){
  const conValor = filas.filter(f => f[campo] != null);
  if (!conValor.length) return null;
  return {
    actual: Number(conValor[conValor.length - 1][campo]),
    fechaDe: n => { const f = conValor.find(x => Number(x[campo]) >= n); return f ? f.fecha : null; }
  };
}

/* Escalones que no terminan: se muestran los logrados y tres más.
   "decenas": 10, 20, 30… · "unoCinco": 100, 500, 1.000, 5.000, 10.000… */
function escalonesDe(s, actual){
  if (Array.isArray(s.escalones)) return s.escalones;
  const lista = [];
  let n = s.escalones === "decenas" ? 10 : 100;
  const siguiente = x => s.escalones === "decenas" ? x + 10 : (String(x)[0] === "1" ? x * 5 : x * 2);
  let despues = 0;
  while (despues < 3){
    lista.push(n);
    if (n > (actual || 0)) despues++;
    n = siguiente(n);
  }
  return lista;
}

/* ============================================================
   4. Pintado
   ============================================================ */
function pintar(datos){
  const logrados = [];
  const siguientes = [];
  let total = 0;

  SERIES.forEach(s => {
    const d = datos[s.clave];
    const lista = escalonesDe(s, d ? d.actual : 0);
    total += lista.length;
    let siguienteMarcado = false;
    lista.forEach(n => {
      if (d && d.actual >= n){
        logrados.push({ s, n, cuando: d.fechaDe(n) });
      } else if (!siguienteMarcado){
        siguienteMarcado = true;
        siguientes.push({ s, n, actual: d ? d.actual : null, restantes: lista.filter(x => x > n).length });
      }
    });
  });

  logrados.sort((a, b) => (a.cuando ? new Date(a.cuando) : Infinity) - (b.cuando ? new Date(b.cuando) : Infinity));

  $("#kpis").innerHTML =
    '<div class="dato"><div class="cifra lima">' + num(logrados.length) + '</div>' +
      '<span class="etiqueta">Hitos desbloqueados de ' + num(total) + '</span></div>' +
    SERIES.map(s => {
      const d = datos[s.clave];
      return '<div class="dato"><div class="cifra">' + (d ? escapar(s.valor(d.actual)) : "—") + '</div>' +
        '<span class="etiqueta">' + escapar(s.nombre) + '</span></div>';
    }).join("");

  $("#linea-hitos").innerHTML =
    '<ol class="linea-hitos">' +
      (logrados.length
        ? '<li class="hl-sep">Desbloqueados</li>' + logrados.map(logrado).join("")
        : '<li class="hl-sep">Todavía no hay hitos desbloqueados</li>') +
      (siguientes.length ? '<li class="hl-sep">Siguientes</li>' + siguientes.map(bloqueado).join("") : '') +
    '</ol>';
}

function logrado(h){
  return '<li class="hl on">' +
    '<span class="hl-punto" aria-hidden="true"></span>' +
    '<div class="hl-caja">' +
      '<div class="hl-cabeza"><span class="hl-titulo">' + escapar(h.s.titulo(h.n)) + '</span>' +
        '<span class="hl-fecha">' + (h.cuando ? escapar(fecha(h.cuando)) : "sin fecha") + '</span></div>' +
      '<span class="hl-sub">' + escapar(h.s.sentido) + '</span>' +
    '</div></li>';
}

function bloqueado(h){
  const conectado = h.actual != null;
  const porc = conectado ? Math.min(100, pct(h.actual, h.n)) : 0;
  const detalle = conectado
    ? "Van " + h.s.valor(h.actual) + " de " + h.s.valor(h.n)
    : "Se conecta desde n8n";
  return '<li class="hl off">' +
    '<span class="hl-punto" aria-hidden="true"></span>' +
    '<div class="hl-caja">' +
      '<div class="hl-cabeza"><span class="hl-titulo">' + escapar(h.s.titulo(h.n)) + '</span>' +
        (h.restantes ? '<span class="hl-mas">+' + h.restantes + ' después</span>' : '') + '</div>' +
      '<span class="hl-sub">' + escapar(detalle) + '</span>' +
      (conectado
        ? '<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + porc +
          '" aria-label="Avance hacia ' + escapar(h.s.titulo(h.n)) + '"><span style="width:' + porc + '%"></span></div>'
        : '') +
    '</div></li>';
}
