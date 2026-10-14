-- PAULA CORREOS: donde se guardan las planillas y los correos.
--
-- La aplicacion no tiene inicio de sesion, asi que el navegador NUNCA habla
-- con esta base directamente: solo lo hace el servidor de la aplicacion, con
-- la clave secreta. Por eso las dos tablas tienen la seguridad por filas
-- activada y NINGUNA politica, y se les quitan los permisos a los roles
-- publicos (anon y authenticated): con la clave publica no se puede ni leer
-- ni borrar nada.
--
-- Borrar no borra: se marca `borrado_en`. Sin inicio de sesion, cualquier
-- error (o cualquiera con el enlace) podria vaciar la lista; asi todo se
-- puede recuperar desde el panel de Supabase.

-- ---------------------------------------------------------------------------
-- Planillas
-- ---------------------------------------------------------------------------

create table public.planillas (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  borrado_en timestamptz,
  plantilla text not null
    check (plantilla in ('terminal', 'hangar', 'nights', 'custom')),
  titulo text not null default '',
  fecha text not null default '',
  turno text not null default '',
  supervisor text not null default '',
  -- La planilla tal como se escribio, en espanol.
  entrada jsonb not null,
  -- La traduccion al ingles, con las correcciones hechas a mano. Vacia hasta
  -- que se traduce.
  salida jsonb
);

comment on table public.planillas is
  'Planillas de turno de AVX: la entrada en espanol y su resultado en ingles.';

create index planillas_recientes on public.planillas (actualizada_en desc)
  where borrado_en is null;

-- ---------------------------------------------------------------------------
-- Correos guardados (lo que antes vivia solo en el navegador)
-- ---------------------------------------------------------------------------

create table public.guardados (
  -- El identificador lo pone la aplicacion: asi el mismo correo no se
  -- duplica al subir lo que ya estaba guardado en el navegador.
  id text primary key,
  creado_en timestamptz not null default now(),
  borrado_en timestamptz,
  entrada text not null,
  resultado text not null,
  asunto text,
  idioma text not null check (idioma in ('es', 'en')),
  accion text not null,
  tipo text not null,
  tono text not null
);

comment on table public.guardados is
  'Correos, reportes y mensajes que se han procesado en la aplicacion.';

create index guardados_recientes on public.guardados (creado_en desc)
  where borrado_en is null;

-- ---------------------------------------------------------------------------
-- Acceso: solo el servidor
-- ---------------------------------------------------------------------------

alter table public.planillas enable row level security;
alter table public.guardados enable row level security;

revoke all on public.planillas from anon, authenticated;
revoke all on public.guardados from anon, authenticated;

grant select, insert, update on public.planillas to service_role;
grant select, insert, update on public.guardados to service_role;
