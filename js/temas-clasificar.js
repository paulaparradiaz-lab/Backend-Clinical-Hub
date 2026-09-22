/* ============================================================
   CLINICAL HUB · CLASIFICAR TEMAS PEDIDOS
   Los médicos escriben el mismo tema de muchas formas: "sepsis y
   shock septico", "sepsis y choque septico", "sepsis, tep, dengue".
   Aquí se unifican en TEMAS CANÓNICOS.

   Nada se renombra ni se borra: el texto original de la petición
   queda intacto para siempre. Solo se agrega una capa encima:
     tema_canonico : el nombre oficial del tema
     tema_peticion : esta petición cuenta para este tema (varios)
     tema_alias    : este texto, tal cual, cae en este tema, para
                     que las peticiones futuras se clasifiquen solas

   Una petición puede contar para varios temas a la vez.
   La clasificación propia de una petición manda sobre el alias.
   ============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer } from "./nucleo.js";

export const clasif = { temas: [], porPeticion: new Map(), porClave: new Map(), descartado: null };

function mapear(filas, llave, valor){
  const m = new Map();
  (filas || []).forEach(r => {
    const k = r[llave];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r[valor]);
  });
  return m;
}

function unicos(a){
  return a.filter((v, i, t) => t.indexOf(v) === i);
}

/* ============================================================
   1. Leer la clasificación
   ============================================================ */
export async function cargarClasificacion(){
  const a = await sb.from("tema_canonico").select("id,nombre,descartado").order("nombre");
  const b = await sb.from("tema_peticion").select("feedback_id,tema_id");
  const c = await sb.from("tema_alias").select("tema_clave,tema_id");
  const err = a.error || b.error || c.error;
  if (err){
    avisar("No se pudo leer la clasificación de temas. " + err.message, "mal", "#aviso-panel");
    return clasif;
  }
  clasif.temas = a.data || [];
  clasif.descartado = clasif.temas.filter(t => t.descartado)[0] || null;
  clasif.porPeticion = mapear(b.data, "feedback_id", "tema_id");
  clasif.porClave = mapear(c.data, "tema_clave", "tema_id");
  return clasif;
}

export function temaPorId(id){
  return clasif.temas.filter(t => t.id === id)[0] || null;
}

/* Qué temas canónicos le corresponden a una petición. Si alguien
   la clasificó a mano, eso manda; si no, se usa el alias de su
   texto; si no hay nada, se devuelve vacío y la petición se sigue
   agrupando por el texto tal cual se escribió. */
export function temaIdsDe(x){
  const propios = clasif.porPeticion.get(x.id);
  if (propios && propios.length) return propios;
  const porTexto = clasif.porClave.get(x.tema_clave);
  if (porTexto && porTexto.length) return porTexto;
  return [];
}

export function esDescartada(x){
  const ids = temaIdsDe(x);
  if (!ids.length) return false;
  return ids.every(id => { const t = temaPorId(id); return !!(t && t.descartado); });
}

export function nombresDe(x){
  return temaIdsDe(x)
    .map(id => { const t = temaPorId(id); return t ? t.nombre : ""; })
    .filter(Boolean);
}

/* ============================================================
   2. Ventana para clasificar
   Sirve para tres cosas: unir a un tema que ya existe, crear
   temas nuevos, o sacar del ranking lo que no es un tema.
   Se puede usar sobre un grupo entero del ranking (varios temas
   seleccionados a la vez) o sobre una sola petición.
   ============================================================ */
export function ventanaClasificar(op){
  const ids = unicos(op.ids || []);
  const claves = unicos(op.claves || []);
  if (!ids.length) return;
  const actuales = op.actuales || [];
  const vivos = clasif.temas.filter(t => !t.descartado);

  const lista = vivos.length
    ? vivos.map(t => '<label class="opcion-tema" style="display:block;margin:4px 0">' +
        '<input type="checkbox" class="c-tema" value="' + t.id + '"' +
        (actuales.indexOf(t.id) > -1 ? " checked" : "") + '> ' + escapar(t.nombre) + '</label>').join("")
    : '<p class="mini">Todavía no hay temas creados. Escribe el primero abajo.</p>';

  const cuerpo =
    '<p class="mini">Esto no cambia lo que escribió el médico: su texto queda igual. ' +
    'Solo defines en qué tema del ranking cuenta.</p>' +
    '<span class="etiqueta">Unir a un tema que ya existe</span>' +
    '<div class="lista-temas" style="max-height:220px;overflow:auto">' + lista + '</div>' +
    '<span class="etiqueta">O crear temas nuevos</span>' +
    '<input class="campo" id="c-nuevos" placeholder="Ej.: Shock séptico, Lesión renal aguda">' +
    '<p class="mini">Separa con comas si el texto pide varios temas a la vez. Una misma ' +
    'petición puede contar para varios temas; en el ranking suma en cada uno.</p>' +
    '<label class="opcion-tema" style="display:block;margin:4px 0"><input type="checkbox" id="c-descartar">' +
    ' No es un tema · sacarlo del ranking</label>' +
    '<label class="opcion-tema" style="display:block;margin:4px 0"><input type="checkbox" id="c-limpiar">' +
    ' Quitar la clasificación · volver a agrupar por el texto</label>' +
    (claves.length
      ? '<p class="mini">Las peticiones que lleguen después escritas igual caerán solas en este tema.</p>'
      : '<p class="mini">Cambio solo para esta petición: no afecta a las demás que digan lo mismo.</p>');

  abrirVentana({
    titulo: "Clasificar tema",
    guia: (op.nombre || "Sin nombre") + " · " + plural(ids.length, "petición", "peticiones"),
    cuerpo: cuerpo,
    aceptar: "Guardar",
    ancha: true,
    alAceptar: async () => {
      const limpiar = marcado("c-limpiar");
      const descartar = marcado("c-descartar");
      let finales = [];

      if (limpiar) finales = [];
      else if (descartar) finales = clasif.descartado ? [clasif.descartado.id] : [];
      else {
        finales = Array.prototype.slice.call(document.querySelectorAll(".c-tema:checked")).map(e => e.value);
        const nuevos = String(leer("c-nuevos") || "").split(",").map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < nuevos.length; i++){
          const id = await idDeTema(nuevos[i]);
          if (id) finales.push(id);
        }
      }
      finales = unicos(finales);

      if (!limpiar && !finales.length){
        avisar("Elige un tema, escribe uno nuevo, o marca una de las dos casillas.", "mal", "#aviso-forma");
        return false;
      }

      const usuario = estado.usuario && estado.usuario.id;

      const d1 = await sb.from("tema_peticion").delete().in("feedback_id", ids);
      if (d1.error) throw d1.error;
      if (finales.length){
        const nuevas = [];
        ids.forEach(i => finales.forEach(t => nuevas.push({ feedback_id:i, tema_id:t, creado_por:usuario })));
        const i1 = await sb.from("tema_peticion").insert(nuevas);
        if (i1.error) throw i1.error;
      }

      if (op.alias && claves.length){
        const d2 = await sb.from("tema_alias").delete().in("tema_clave", claves);
        if (d2.error) throw d2.error;
        if (finales.length){
          const alias = [];
          claves.forEach(c => finales.forEach(t => alias.push({ tema_clave:c, tema_id:t, creado_por:usuario })));
          const i2 = await sb.from("tema_alias").insert(alias);
          if (i2.error) throw i2.error;
        }
      }

      avisar(limpiar
        ? "Clasificación quitada · vuelve a agruparse por el texto."
        : "Listo · " + plural(ids.length, "petición clasificada", "peticiones clasificadas"),
        "", "#aviso-panel");

      await cargarClasificacion();
      if (op.recargar) await op.recargar();
    }
  });
}

function plural(n, uno, varios){
  return n + " " + (n === 1 ? uno : varios);
}

function marcado(id){
  const e = document.getElementById(id);
  return !!(e && e.checked);
}

/* Reusa el tema si ya existe con ese nombre, sin importar mayúsculas */
async function idDeTema(nombre){
  const ya = clasif.temas.filter(t => String(t.nombre).trim().toLowerCase() === nombre.toLowerCase())[0];
  if (ya) return ya.id;
  const r = await sb.from("tema_canonico")
    .insert({ nombre: nombre, creado_por: estado.usuario && estado.usuario.id })
    .select("id,nombre,descartado").single();
  if (r.error) throw r.error;
  clasif.temas.push(r.data);
  return r.data.id;
}
