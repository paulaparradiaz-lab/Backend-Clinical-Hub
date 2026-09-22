/* ============================================================
   CLINICAL HUB · PANEL
   Entrada del panel: acceso con 2FA, barra superior y pestañas.
   Cada pestaña vive en su propio archivo.
   ============================================================ */
import { sb, $, estado, escapar, avisar, ocupado, traducirError,
         cargarCatalogos, cerrarVentana } from "./nucleo.js";
import * as resenas from "./resenas.js";
import * as temas from "./temas.js";
import * as mejoras  from "./mejoras.js";

/* Aquí crece el panel: añade una sección con su render y listo. */
const SECCIONES = [
  { id:"resenas", nombre:"Reseñas", render: resenas.render },
{ id:"temas", nombre:"Temas pedidos", render: temas.render },
  { id:"mejoras",   nombre:"Mejoras",  render: mejoras.render },
  { id:"ventas",    nombre:"Ventas" },
  { id:"contenido", nombre:"Contenido" },
  { id:"admin",     nombre:"Administrativo" }
];

let seccionActiva = "resenas";
let factorId = null;

/* ============================================================
   1. ACCESO: contraseña + código TOTP (nivel aal2)
   ============================================================ */
const PASOS = ["paso-login", "paso-enrolar", "paso-codigo"];

function mostrarPaso(id){
  PASOS.forEach(p => { $("#" + p).hidden = (p !== id); });
  $("#volver").hidden = (id === "paso-login");
  $("#acceso").hidden = false;
  $("#panel").hidden = true;
  const primero = $("#" + id + " input");
  if (primero) setTimeout(() => primero.focus(), 50);
}

async function decidir(){
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return mostrarPaso("paso-login");
  const { data: nivel, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error){ avisar(traducirError(error.message), "mal"); return mostrarPaso("paso-login"); }
  if (nivel.currentLevel === "aal2") return abrirPanel(s.session);
  if (nivel.nextLevel === "aal2") return pedirCodigo();
  return enrolar();
}

async function entrar(){
  const correo = $("#correo").value.trim();
  const clave  = $("#clave").value;
  if (!correo.includes("@") || !clave){ avisar("Escribe tu correo y tu contraseña.", "mal"); return; }
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  avisar("");
  $("#clave").value = "";
  await decidir();
}

async function enrolar(){
  const { data: lista } = await sb.auth.mfa.listFactors();
  for (const factor of ((lista && lista.all) || [])){
    if (factor.status === "unverified") await sb.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Clinical Hub panel " + new Date().toISOString().slice(0, 10)
  });
  if (error){ avisar(traducirError(error.message), "mal"); return mostrarPaso("paso-login"); }
  factorId = data.id;
  $("#qr").src = data.totp.qr_code;
  $("#secreto").textContent = data.totp.secret;
  avisar("");
  mostrarPaso("paso-enrolar");
}

async function pedirCodigo(){
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error || !data.totp.length) return enrolar();
  factorId = data.totp[0].id;
  avisar("");
  mostrarPaso("paso-codigo");
}

async function verificarCodigo(selector){
  const code = $(selector).value.replace(/\D/g, "");
  if (code.length !== 6){ avisar("El código tiene 6 dígitos.", "mal"); return; }
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  $(selector).value = "";
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  avisar("");
  await decidir();
}

async function salir(){
  await sb.auth.signOut();
  location.reload();
}

$("#entrar").addEventListener("click", () => ocupado($("#entrar"), "Entrando…", entrar));
$("#clave").addEventListener("keydown", e => { if (e.key === "Enter") $("#entrar").click(); });
$("#confirmar-enrolar").addEventListener("click", () =>
  ocupado($("#confirmar-enrolar"), "Verificando…", () => verificarCodigo("#codigo-enrolar")));
$("#codigo-enrolar").addEventListener("keydown", e => { if (e.key === "Enter") $("#confirmar-enrolar").click(); });
$("#verificar").addEventListener("click", () =>
  ocupado($("#verificar"), "Verificando…", () => verificarCodigo("#codigo")));
$("#codigo").addEventListener("keydown", e => { if (e.key === "Enter") $("#verificar").click(); });
$("#salir").addEventListener("click", salir);
$("#volver").addEventListener("click", salir);

/* Repetir el chiste de la entrada al hacer clic */
$("#chiste").addEventListener("click", () => {
  const s = $("#chiste .chiste");
  s.classList.remove("play");
  void s.getBoundingClientRect();
  s.classList.add("play");
});

/* ============================================================
   2. PANEL: barra superior y pestañas
   ============================================================ */
async function abrirPanel(sesion){
  if (!$("#panel").hidden) return;
  $("#acceso").hidden = true;
  $("#panel").hidden = false;

  const correo = sesion.user.email || "";
  estado.usuario = { id: sesion.user.id, correo: correo };
  $("#usuario-correo").textContent = correo;
  $("#menu-correo").textContent = correo;
  $("#avatar").textContent = iniciales(correo);
  pintarTemaActual();

  await cargarCatalogos();
  pintarPestanas();
  abrirSeccion(seccionActiva);
}

function iniciales(correo){
  const nombre = correo.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim().split(/\s+/);
  const a = (nombre[0] || "?")[0] || "?";
  const b = nombre[1] ? nombre[1][0] : (nombre[0] || "")[1] || "";
  return (a + b).toUpperCase();
}

function pintarPestanas(){
  $("#pestanas").innerHTML = SECCIONES.map(s => s.render
    ? '<button class="pestana" role="tab" data-seccion="' + s.id + '" aria-selected="' +
      (s.id === seccionActiva) + '">' + escapar(s.nombre) + '</button>'
    : '<button class="pestana" role="tab" aria-selected="false" aria-disabled="true" tabindex="-1" ' +
      'title="Todavía no conectado">' + escapar(s.nombre) + '<span class="pronto">pronto</span></button>'
  ).join("");
}

function abrirSeccion(id){
  const s = SECCIONES.find(x => x.id === id);
  if (!s || !s.render) return;
  seccionActiva = id;
  pintarPestanas();
  $("#vista").innerHTML = '<p class="vacio">Cargando…</p>';
  s.render();
}

$("#pestanas").addEventListener("click", e => {
  const b = e.target.closest("button[data-seccion]");
  if (b) abrirSeccion(b.dataset.seccion);
});

/* ============================================================
   3. Menú de usuario, tema y contraseña
   ============================================================ */
const botonUsuario = $("#usuario-boton");
const menu = $("#menu-usuario");

function abrirMenu(abrir){
  menu.hidden = !abrir;
  botonUsuario.setAttribute("aria-expanded", String(abrir));
}

botonUsuario.addEventListener("click", e => { e.stopPropagation(); abrirMenu(menu.hidden); });
document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) abrirMenu(false); });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#velo-forma").hidden) cerrarVentana();
  else if (!$("#velo-clave").hidden) cerrarVentanaClave();
  else if (!menu.hidden){ abrirMenu(false); botonUsuario.focus(); }
});

function pintarTemaActual(){
  $("#tema-actual").textContent = document.documentElement.dataset.theme === "light" ? "Claro" : "Oscuro";
}

$("#cambiar-tema").addEventListener("click", () => {
  const nuevo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem("ch-tema", nuevo); } catch(e) {}
  pintarTemaActual();
});

$("#abrir-clave").addEventListener("click", () => {
  abrirMenu(false);
  avisar("", "", "#aviso-clave");
  $("#clave-nueva").value = "";
  $("#clave-repetir").value = "";
  $("#velo-clave").hidden = false;
  setTimeout(() => $("#clave-nueva").focus(), 50);
});

function cerrarVentanaClave(){
  $("#velo-clave").hidden = true;
  botonUsuario.focus();
}

$("#cancelar-clave").addEventListener("click", cerrarVentanaClave);
$("#velo-clave").addEventListener("click", e => { if (e.target.id === "velo-clave") cerrarVentanaClave(); });
$("#clave-repetir").addEventListener("keydown", e => { if (e.key === "Enter") $("#guardar-clave").click(); });

$("#guardar-clave").addEventListener("click", () => ocupado($("#guardar-clave"), "Guardando…", async () => {
  const nueva   = $("#clave-nueva").value;
  const repetir = $("#clave-repetir").value;
  if (nueva.length < 8){ avisar("Usa al menos 8 caracteres.", "mal", "#aviso-clave"); return; }
  if (nueva !== repetir){ avisar("Las dos contraseñas no coinciden.", "mal", "#aviso-clave"); return; }
  const { error } = await sb.auth.updateUser({ password: nueva });
  if (error){ avisar(traducirError(error.message), "mal", "#aviso-clave"); return; }
  avisar("Contraseña actualizada. La próxima vez entras con la nueva.", "ok", "#aviso-clave");
  $("#clave-nueva").value = "";
  $("#clave-repetir").value = "";
  setTimeout(cerrarVentanaClave, 1800);
}));

/* Arranque */
decidir();
