create table public.players (
  id uuid not null default gen_random_uuid (),
  club_id uuid null,
  name text not null,
  position text null,
  detailed_position text null,
  age integer null,
  nationality text null,
  attack integer null,
  defense integer null,
  overall integer null,
  value_amount numeric null,
  value_str text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint players_pkey primary key (id),
  constraint unique_player_per_club unique (club_id, name, age, nationality),
  constraint players_club_id_fkey foreign KEY (club_id) references clubs (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_players_club_id on public.players using btree (club_id) TABLESPACE pg_default;

create index IF not exists idx_players_smart_scout on public.players using btree (detailed_position, nationality, age, overall) TABLESPACE pg_default;

create index IF not exists idx_players_nationality on public.players using btree (nationality) TABLESPACE pg_default;

create index IF not exists idx_players_age on public.players using btree (age) TABLESPACE pg_default;

create index IF not exists idx_players_overall on public.players using btree (overall) TABLESPACE pg_default;