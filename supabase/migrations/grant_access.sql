-- Fixes "permission denied for table projects". Safe to run more than once.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
