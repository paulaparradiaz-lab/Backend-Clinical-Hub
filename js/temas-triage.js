/* ============================================================
   CLINICAL HUB · TRIAGE POR TEMA
   En Temas pedidos se actúa sobre el tema completo, nunca sobre
   una petición suelta. Si seis médicos pidieron falla cardiaca,
   una sola mejora queda enlazada al tema entero.
   El enlace vive en public.accion_tema: las reseñas van por su
   cuenta en public.accion_feedback y una cosa no arrastra a la otra.
   ============================================================ */
import { sb, estado, escapar, avisar, abrirVentana, leer,
         opcionesEquipo, opciones } from "./nucleo.js";

const TIPOS = [["contenido","Contenido"], ["producto","Producto"], ["proceso","Proceso"],
               ["soporte","Soporte"], ["otro","Otro"]];
const PRIORIDADES = [["alta","Prioridad alta"], ["media","Prioridad media"], ["baja","Prioridad baja"]];
const NOMBRE_ESTADO = { propuesta:"propuesta", en_curso:"en curso", entregada:"entregada",
                        descartada:"descartada" };

function plural(n, uno, varios){
  return n + " " + (n === 1 ? uno : varios);
}

/* ============================================================
   1. Marcar o quitar revisado en todas las peticiones del tema
   ============================================================ */
export async function revisarTema(ids, valor, boton, recargar){
  if (!ids || !ids.length) return;
  if (boton) boton.disabled = true;
  const ahora = new Date().toISOString();
  const { error } = await sb.from("feedback_triage").upsert(
    ids.map(id => ({
      feedback_id: id,
      revisado: valor,
      revisado_por: estado.usuario && estado.usuario.id,
      revisado_en: ahora
    })), { onConflict:"feedback_id" });
  if (boton) boton.disabled = false;
  if (error){ avisar("No se pudo guardar el revisado del tema.", "mal", "#aviso-panel"); return; }
  avisar(valor
    ? "Tema revisado · " + plural(ids.length, "petición marcada", "peticiones marcadas")
    : "Revisado quitado del tema.", "", "#aviso-panel");
  if (recargar) await recargar();
}

/* ============================================================
   2. Crear o enlazar la mejora del tema
   Una sola mejora se enlaza con todas las peticiones del tema.
   El selector de arriba sirve para dos cosas: crear una mejora
   nueva, o enganchar este tema a una mejora que ya existe
   (útil cuando el mismo tema llegó escrito de otra manera).
   ============================================================ */
export async function ventanaMejoraTema(tema, ids, recargar){
  if (!tema || !tema.id) return;
  const r = await sb.from("acciones").select("id,numero,titulo,estado")
    .order("numero", { ascending:false });
  const mejoras = r.data || [];
  const sugerido = String(tema.nombre || "").slice(0, 80);
  const cuantas = ids.length;

  const cuerpo =
    '<p class="mini">La mejora queda enlazada a este tema completo. Hoy lo piden ' + plural(cuantas, "petición", "peticiones") +
    ', y las que lleguen después quedan cubiertas igual.</p>' +
    '<span class="etiqueta">A qué mejora pertenece</span>' +
    '<select class="campo" id="m-accion">' +
    '<option value="">Crear una mejora nueva</option>' +
    mejoras.map(a => '<option value="' + a.id + '">#' + a.numero + ' · ' + escapar(a.titulo) +
      ' · ' + escapar(NOMBRE_ESTADO[a.estado] || a.estado) + '</option>').join("") +
    '</select>' +
    '<p class="mini">Si este tema es otra forma de decir algo que ya trabajaste, elige la mejora ' +
    'que ya existe y el tema queda enlazado a ella.</p>' +
    '<div id="m-nueva">' +
    '<input class="campo" id="m-titulo" placeholder="Título de la mejora" value="' + escapar(sugerido) + '">' +
    '<textarea class="campo" id="m-desc" placeholder="Qué vamos a cambiar y por qué"></textarea>' +
    '<div class="campos">' +
    '<select class="campo" id="m-tipo">' + opciones(TIPOS, "contenido") + '</select>' +
    '<select class="campo" id="m-prioridad">' + opciones(PRIORIDADES, "media") + '</select>' +
    '</div>' +
    '<input class="campo" id="m-impacto" placeholder="Qué esperamos que mejore (opcional)">' +
    '</div>' +
    '<span class="etiqueta">Primera tarea (opcional)</span>' +
    '<input class="campo" id="m-tarea" placeholder="Ej.: escribir la guía de falla cardiaca">' +
    '<div class="campos">' +
    '<select class="campo" id="m-resp">' + opcionesEquipo() + '</select>' +
    '<input class="campo" id="m-vence" type="date">' +
    '</div>';

  abrirVentana({
    titulo: "Mejora del tema",
    guia: sugerido + " · " + plural(cuantas, "petición", "peticiones"),
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

      const v = await sb.from("accion_tema").upsert(
        [{ accion_id: accionId, tema_id: tema.id }],
        { onConflict:"accion_id,tema_id", ignoreDuplicates:true });
      if (v.error) throw v.error;

      const tarea = leer("m-tarea");
      if (tarea){
        const t = await sb.from("tareas").insert({
          accion_id: accionId,
          titulo: tarea,
          responsable_id: leer("m-resp"),
          vence_el: leer("m-vence"),
          creada_por: estado.usuario && estado.usuario.id
        });
        if (t.error) throw t.error;
      }
      if (recargar) await recargar();
    }
  });

  const sel = document.getElementById("m-accion");
  if (sel) sel.addEventListener("change", () => {
    const caja = document.getElementById("m-nueva");
    if (caja) caja.hidden = !!sel.value;
  });
}

/* ============================================================
   3. Quitar la mejora de un tema
   Solo borra el enlace tema ↔ mejora de accion_tema. La mejora
   sigue viva en la hoja de vida con su historia y sus tareas; el
   tema vuelve al ranking como "sin mejora". Las reseñas no se tocan.
   ============================================================ */
export function ventanaDesvincularTema(tema, accionId, recargar){
  if (!tema || !tema.id || !accionId) return;
  abrirVentana({
    titulo: "Desvincular la mejora",
    guia: tema.nombre,
    cuerpo: '<p class="mini">El tema <b>' + escapar(tema.nombre) + '</b> vuelve a quedar ' +
      'como “sin mejora” en el ranking. La mejora no se borra ni se descarta: sigue en ' +
      'la hoja de vida con sus tareas. Si te equivocaste, puedes volver a enlazarla con ' +
      '“Crear mejora” y eligiendo arriba la mejora que ya existe.</p>',
    aceptar: "Desvincular",
    alAceptar: async () => {
      const r = await sb.from("accion_tema").delete()
        .eq("accion_id", accionId).eq("tema_id", tema.id);
      if (r.error) throw r.error;
      avisar("Tema desvinculado de la mejora.", "", "#aviso-panel");
      if (recargar) await recargar();
    }
  });
}
