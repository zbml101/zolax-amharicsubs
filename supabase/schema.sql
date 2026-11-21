create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  cues jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.projects enable row level security;
create policy "owner only" on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Subtitle look & default position (percent from top of the video)
alter table public.projects add column style jsonb not null default '{"y":85,"size":100}';
