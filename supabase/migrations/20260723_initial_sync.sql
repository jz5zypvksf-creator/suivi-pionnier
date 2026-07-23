-- Suivi pionnier — structure sécurisée pour la synchronisation multi-appareils.
-- Ce script peut être exécuté depuis le SQL Editor de Supabase.

create extension if not exists pgcrypto;

create table if not exists public.pioneer_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pioneer_type text not null default 'permanent'
    check (pioneer_type in ('permanent', 'auxiliaire')),
  selected_year integer not null,
  selected_aux_month smallint not null default 0
    check (selected_aux_month between 0 and 11),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_user_name_unique
  on public.students (user_id, lower(trim(name)));

create index if not exists students_user_id_idx
  on public.students (user_id);

create table if not exists public.activities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  category text not null
    check (category in ('Ministère', 'Cours biblique', 'Informel', 'Autre', 'Maison / jardin')),
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  note text not null default '',
  student_id uuid references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_user_id_idx
  on public.activities (user_id);

create index if not exists activities_user_date_idx
  on public.activities (user_id, activity_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pioneer_settings_set_updated_at on public.pioneer_settings;
create trigger pioneer_settings_set_updated_at
before update on public.pioneer_settings
for each row execute function public.set_updated_at();

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

alter table public.pioneer_settings enable row level security;
alter table public.students enable row level security;
alter table public.activities enable row level security;

drop policy if exists "Users manage their settings" on public.pioneer_settings;
create policy "Users manage their settings"
on public.pioneer_settings
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their students" on public.students;
create policy "Users manage their students"
on public.students
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their activities" on public.activities;
create policy "Users manage their activities"
on public.activities
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.pioneer_settings to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
