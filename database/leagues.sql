create table public.leagues (
  id uuid not null default gen_random_uuid (),
  name text not null,
  country text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint leagues_pkey primary key (id),
  constraint unique_league_name unique (name)
) TABLESPACE pg_default;