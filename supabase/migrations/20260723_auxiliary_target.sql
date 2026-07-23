alter table public.pioneer_settings
  add column if not exists auxiliary_target smallint not null default 30
    check (auxiliary_target in (15, 30));
