/* ============================================================
   CLINICAL HUB · PANEL
   Entrada del panel: acceso con 2FA, barra superior y pestañas.
   Cada pestaña vive en su propio archivo.
   ============================================================ */
import { sb, $, estado, escapar, avisar, ocupado, traducirError,
         cerrarVentana } from "./nucleo.js";
import * as feedback from "./pestana-feedback.js";
import * as mejoras from "./pestana-mejoras.js";

/* Aquí crece el panel: añade una sección con su render y listo.
   Feedback y Mejoras leen solo las tablas de la IA (ver ia.js). */
const SECCIONES = [
  { id:"feedback", nombre:"Feedback", render: feedback.render },
  { id:"mejoras",  nombre:"Mejoras",  render: mejoras.render },
  { id:"ventas",   nombre:"Ventas" },
  { id:"hitos",    nombre:"Hitos" }
];

let seccionActiva = "feedback";
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
  /* Se pintan una sola vez; al cambiar de sección solo se marca la activa
     (así la curva de la barra lateral puede deslizarse entre pestañas). */
  $("#pestanas").innerHTML = SECCIONES.map(s => s.render
    ? '<button class="pestana" role="tab" data-seccion="' + s.id + '" aria-selected="' +
      (s.id === seccionActiva) + '"><span class="pestana-txt"' +
      (s.corto ? ' data-corto="' + escapar(s.corto) + '"' : '') + '>' + escapar(s.nombre) + '</span></button>'
    : '<button class="pestana" role="tab" aria-selected="false" aria-disabled="true" tabindex="-1" ' +
      'title="Todavía no conectado"><span class="pestana-txt">' + escapar(s.nombre) +
      '<span class="pronto">pronto</span></span></button>'
  ).join("");
  if (!$(".pestana-curva")){
    const curva = document.createElement("span");
    curva.className = "pestana-curva";
    curva.setAttribute("aria-hidden", "true");
    $(".barra-superior").appendChild(curva);
  }
  marcarPestana();
}

/* Marca la pestaña activa y lleva la curva hasta ella */
function marcarPestana(){
  document.querySelectorAll("#pestanas .pestana[data-seccion]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.seccion === seccionActiva)));
  moverCurva();
}

/* En escritorio la curva baja por la barra lateral; en celular el menú
   va abajo y la curva se desliza de lado sobre él (mismo corte de 900 px
   que el CSS). */
const menuAbajo = window.matchMedia("(max-width: 899px)");

function moverCurva(){
  const curva = $(".pestana-curva");
  const activa = $('#pestanas .pestana[aria-selected="true"]');
  if (!curva || !activa) return;
  const caja = activa.getBoundingClientRect();
  if (menuAbajo.matches){
    curva.style.transform = "translateX(" + (caja.left + caja.width / 2 - curva.offsetWidth / 2) + "px)";
    return;
  }
  const barra = $(".barra-superior").getBoundingClientRect();
  curva.style.transform = "translateY(" + (caja.top - barra.top + caja.height / 2 - 46) + "px)";
}
window.addEventListener("resize", moverCurva);
menuAbajo.addEventListener("change", moverCurva);

function abrirSeccion(id){
  const s = SECCIONES.find(x => x.id === id);
  if (!s || !s.render) return;
  seccionActiva = id;
  marcarPestana();
  $("#vista").innerHTML = '<p class="vacio">Cargando…</p>';
  s.render();
}

/* Cifras que cuentan desde cero cuando aparecen (estilo Dashboard V2).
   Lee el texto que pone cada módulo (p. ej. "4,6", "1.284", "87%"),
   anima el número y termina dejando exactamente el texto original.
   Si el módulo cambia el texto a mitad de camino, la animación se detiene. */
const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function contar(el){
  if (reducirMovimiento || el.dataset.contado) return;
  const original = el.textContent.trim();
  const m = original.match(/^([^\d-]*)(-?\d[\d.,]*)(.*)$/);
  if (!m) return;
  el.dataset.contado = "1";
  const num = m[2];
  // Decide qué es decimal y qué es miles, respetando cómo lo escribió el módulo
  let decSep = "", milSep = "";
  if (num.includes(",")) { decSep = ","; milSep = num.includes(".") ? "." : ""; }
  else if (/\.\d{3}$/.test(num) && !/\.\d{3}\d/.test(num)) { milSep = "."; }
  else if (num.includes(".")) { decSep = "."; }
  const decimales = decSep ? num.split(decSep)[1].length : 0;
  const limpio = num.split(milSep || "\u0000").join("").replace(decSep || "\u0000", ".");
  const final = parseFloat(limpio);
  if (!isFinite(final) || final === 0) return;
  const pintar = v => {
    let [ent, dec] = v.toFixed(decimales).split(".");
    if (milSep) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, milSep);
    return m[1] + ent + (dec ? decSep + dec : "") + m[3];
  };
  const inicio = performance.now();
  let escrito = original;
  (function paso(ahora){
    if (el.textContent !== escrito) return;              // otro código lo cambió: no pisar
    const t = Math.min(1, (ahora - inicio) / 1100);
    const e = 1 - Math.pow(1 - t, 3);
    escrito = t < 1 ? pintar(final * e) : original;
    el.textContent = escrito;
    if (t < 1) requestAnimationFrame(paso);
  })(inicio);
}
new MutationObserver(() => {
  document.querySelectorAll("#vista .cifra:not([data-contado])").forEach(contar);
}).observe($("#vista"), { childList: true, subtree: true });

$("#pestanas").addEventListener("click", e => {
  const b = e.target.closest("button[data-seccion]");
  if (b) abrirSeccion(b.dataset.seccion);
});

/* Salto de una pestana a otra desde dentro del panel. Lo usa el ranking
   de Temas pedidos para llevarte a la mejora de ese tema: manda la
   seccion a abrir y, si hace falta, el id de lo que hay que resaltar. */
document.addEventListener("ch-ir", e => {
  const d = (e && e.detail) || {};
  if (d.foco) estado.foco = d.foco;
  if (d.seccion) abrirSeccion(d.seccion);
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
