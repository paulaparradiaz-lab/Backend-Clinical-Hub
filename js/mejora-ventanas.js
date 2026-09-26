/* ============================================================
   CLINICAL HUB · VENTANAS DE LA MEJORA
   Las usan los dos rankings de Métricas (temas pedidos y mejoras
   técnicas) y la pestaña Mejoras. Cada fila del ranking es un código
   del catálogo (slug): un tema o un tipo de mejora técnica.

   Crear       Nueva mejora, o enlazar la fila a una que ya existe.
               Al crearla se le asignan una o varias personas.
   Ver         Título, detalle y estado, editables.
   Desvincular Le quita la mejora a la fila, sin borrarla.
   ============================================================ */
import { escapar, fecha, abrirVentana, avisar, cerrarVentana, leer } from "./nucleo.js";
import { nombreDe, ESTADOS, nombreEstado, crearMejora, enlazarMejora, desvincularMejora,
  editarMejora, cargarUsuarios, asignarPersona } from "./ia.js";
import { plural } from "./ia-ventanas.js";

/* Crear mejora: nueva, o enlazar a una que ya existe.
   que: "tema" o "mejora técnica", para el texto de la ventana. */
export function ventanaCrearMejora({ slug, n, mejoras, que = "tema", alCambiar }){
  const sugerido = nombreDe(slug).slice(0, 80);
  abrirVentana({
    titulo: que === "tema" ? "Mejora del tema" : "Mejora de la mejora técnica",
    guia: sugerido + " · " + plural(n, "comentario", "comentarios"),
    cuerpo:
      '<p class="mini">La mejora queda enlazada a ' + (que === "tema" ? "este tema completo" : "esta mejora técnica completa") +
      '. Hoy lo piden ' + plural(n, "comentario", "comentarios") +
      ', y los que lleguen después quedan cubiertos igual.</p>' +
      '<span class="etiqueta">A qué mejora pertenece</span>' +
      '<select class="campo" id="m-mejora">' +
      '<option value="">Crear una mejora nueva</option>' +
      mejoras.map(m => '<option value="' + m.id + '">#' + m.id + ' · ' + escapar(m.titulo) +
        ' · ' + escapar(nombreEstado(m.estado)) + '</option>').join("") +
      '</select>' +
      '<p class="mini">Si esto es otra forma de decir algo que ya estás trabajando, elige la mejora ' +
      'que ya existe y queda enlazado a ella.</p>' +
      '<div id="m-nueva">' +
      '<input class="campo" id="m-titulo" placeholder="Título de la mejora" value="' + escapar(sugerido) + '">' +
      '<textarea class="campo" id="m-detalle" placeholder="Qué vamos a cambiar y por qué"></textarea>' +
      '<span class="etiqueta">Quién la hace</span>' +
      '<p class="mini">Marca una o varias personas. Puedes cambiarlas después en la pestaña Mejoras.</p>' +
      '<div class="bandeja-opciones" id="m-personas" style="max-height:32vh"><p class="vacio">Cargando…</p></div>' +
      '</div>',
    aceptar: "Guardar",
    ancha: true,
    alAceptar: async () => {
      let id = leer("m-mejora");
      if (!id){
        const titulo = leer("m-titulo");
        if (!titulo){ avisar("Ponle un título a la mejora.", "mal", "#aviso-forma"); return false; }
        id = await crearMejora(titulo, leer("m-detalle"));
        for (const u of elegidas) await asignarPersona(Number(id), u);
      }
      await enlazarMejora(Number(id), slug);
      cerrarVentana();
      await alCambiar("Mejora enlazada a “" + nombreDe(slug) + "”.");
      return false;
    }
  });
  const sel = document.getElementById("m-mejora");
  sel.addEventListener("change", () => { document.getElementById("m-nueva").hidden = !!sel.value; });

  /* Personas: los usuarios del panel, se marcan una o varias */
  const elegidas = new Set();
  const bandeja = document.getElementById("m-personas");
  cargarUsuarios().then(usuarios => {
    if (!document.body.contains(bandeja)) return;
    bandeja.innerHTML = usuarios.length ? usuarios.map(u =>
      '<button type="button" class="fila-opcion" data-usuario="' + escapar(u.id) + '" aria-pressed="false">' +
      '<span><b>' + escapar(u.nombre) + '</b><span class="mini">' + escapar(u.correo) + '</span></span>' +
      '<span class="marca-opcion" aria-hidden="true"></span></button>').join("")
      : '<p class="vacio">No hay usuarios en el panel.</p>';
  }).catch(() => {
    bandeja.innerHTML = '<p class="vacio">No se pudo leer la lista de personas. La mejora se crea igual y ' +
      'puedes asignarla después en la pestaña Mejoras.</p>';
  });
  bandeja.addEventListener("click", e => {
    const b = e.target.closest("button[data-usuario]");
    if (!b) return;
    const u = b.dataset.usuario;
    if (elegidas.has(u)) elegidas.delete(u); else elegidas.add(u);
    b.setAttribute("aria-pressed", String(elegidas.has(u)));
    b.classList.toggle("recien", elegidas.has(u));
  });
}

/* 👁 Ver mejora: sus datos, editables. slug es opcional (desde qué
   fila se abrió), solo para la línea de arriba. */
export function ventanaVerMejora({ mejora: m, slug, alCambiar }){
  abrirVentana({
    titulo: "Mejora #" + m.id,
    guia: "Creada el " + fecha(m.creado_en) + (slug ? " · enlazada a " + nombreDe(slug) : ""),
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
      await alCambiar("Mejora #" + m.id + " actualizada.");
      return false;
    }
  });
}

/* Desvincular: le quita la mejora a la fila, sin borrarla */
export function ventanaDesvincular({ mejora: m, slug, que = "tema", alCambiar }){
  abrirVentana({
    titulo: "Desvincular mejora",
    guia: nombreDe(slug),
    cuerpo:
      '<p>¿Quitarle la mejora “' + escapar(m.titulo) + '” a “' + escapar(nombreDe(slug)) + '”?</p>' +
      '<p class="mini">La mejora no se borra y sigue enlazada a lo demás que tenga. ' +
      (que === "tema" ? 'El tema' : 'La mejora técnica') + ' vuelve a quedar sin mejora.</p>',
    aceptar: "Desvincular",
    alAceptar: async () => {
      await desvincularMejora(m.id, slug);
      cerrarVentana();
      await alCambiar("Mejora desvinculada de “" + nombreDe(slug) + "”.");
      return false;
    }
  });
}
