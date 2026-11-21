-- Run this only if you already created the table with the first version of schema.sql
alter table public.projects add column if not exists style jsonb not null default '{"y":85,"size":100}';
