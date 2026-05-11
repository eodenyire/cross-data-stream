-- Lock down SECURITY DEFINER functions and set search_path
revoke execute on function public.has_role(uuid, app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, app_role) to authenticated;

alter function public.update_updated_at() set search_path = public;
revoke execute on function public.update_updated_at() from public, anon, authenticated;

alter function public.handle_new_user() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;