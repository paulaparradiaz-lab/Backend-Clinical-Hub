-- ============================================================
-- CLINICAL HUB · BORRAR LO DEL PANEL VIEJO (2026-09-26)
-- Borra PARA SIEMPRE las tablas, vistas y funciones que solo usaba el
-- panel viejo. No guarda copia: Paula decidió no respaldarlas.
-- Correr en Supabase → SQL Editor → Run, solo cuando el panel nuevo
-- ya esté publicado en main y funcionando.
--
-- NO se borra la tabla "feedback": todavía recibe datos (el último
-- llegó el 24 de septiembre), así que algo (la encuesta, WhatsApp o
-- n8n) sigue escribiendo ahí. Se decide aparte cuando se sepa qué es.
-- Lo del panel nuevo (feedback_prueba_clasificacion_por_ia,
-- categorias_para_ia, mejoras_ia y sus tablas, v_ia_feedback,
-- v_ia_mejoras, v_ia_por_revisar, usuarios_panel) no se toca.
-- ============================================================

begin;

-- 1. Vistas del panel viejo (y v_ia_temas, que el panel nuevo no usa)
drop view if exists public.v_hoja_de_vida;
drop view if exists public.v_tareas_detalle;
drop view if exists public.v_feedback_detalle;
drop view if exists public.v_resenas;
drop view if exists public.v_temas_pedidos;
drop view if exists public.v_ia_temas;

-- 2. Tablas viejas, de las que dependen de otras hacia las de base
drop table if exists public.tareas;
drop table if exists public.accion_feedback;
drop table if exists public.accion_tema;
drop table if exists public.acciones;
drop table if exists public.equipo;
drop table if exists public.feedback_etiquetas;
drop table if exists public.etiquetas;
drop table if exists public.feedback_triage;
drop table if exists public.tema_peticion;
drop table if exists public.tema_alias;
drop table if exists public.tema_canonico;

-- 3. Funciones de los disparadores viejos (sus disparadores se fueron con las tablas)
drop function if exists public.marcar_accion();
drop function if exists public.marcar_tarea();
drop function if exists public.tocar_actualizado();

commit;
