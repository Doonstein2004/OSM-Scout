create table public.clubs (
  id uuid not null default gen_random_uuid (),
  league_id uuid null,
  name text not null,
  objective integer null,
  squad_value numeric null,
  fixed_income numeric null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint clubs_pkey primary key (id),
  constraint unique_club_per_league unique (league_id, name),
  constraint clubs_league_id_fkey foreign KEY (league_id) references leagues (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_clubs_league_id on public.clubs using btree (league_id) TABLESPACE pg_default;