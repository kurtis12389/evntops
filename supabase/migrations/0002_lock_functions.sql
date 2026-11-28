-- Trigger functions are never called directly; role helpers only reveal the caller's own role.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_order_status() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.set_order_status(uuid, text, text) from public, anon;
revoke execute on function public.record_scan(uuid, uuid, text, text, integer, timestamptz) from public, anon;
grant execute on function public.my_role(), public.is_staff(), public.is_member(), public.is_admin() to authenticated;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;
grant execute on function public.record_scan(uuid, uuid, text, text, integer, timestamptz) to authenticated;
