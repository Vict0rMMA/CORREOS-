-- Supabase da todos los permisos a service_role en las tablas nuevas. Borrar
-- en la aplicacion solo marca borrado_en: se le quita el borrado de verdad,
-- para que ni un fallo ni nadie con la clave del servidor pueda vaciarlas.
revoke delete, truncate on public.planillas from service_role;
revoke delete, truncate on public.guardados from service_role;
