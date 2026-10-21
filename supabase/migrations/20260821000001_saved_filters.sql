-- Saved filters / lists, stored per account so they survive reinstalling the
-- app, clearing storage, or opening the app on another device.
--
-- `id` is client-generated (Date.now() string), so the key is (user_id, id).
create table if not exists public.saved_filters (
    user_id    uuid        not null references auth.users (id) on delete cascade,
    id         text        not null,
    name       text        not null,
    filters    jsonb       not null default '{}'::jsonb,
    results    jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, id)
);

create index if not exists saved_filters_user_created_idx
    on public.saved_filters (user_id, created_at);

alter table public.saved_filters enable row level security;

create policy "saved_filters_select_own" on public.saved_filters
    for select using (auth.uid() = user_id);

create policy "saved_filters_insert_own" on public.saved_filters
    for insert with check (auth.uid() = user_id);

create policy "saved_filters_update_own" on public.saved_filters
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "saved_filters_delete_own" on public.saved_filters
    for delete using (auth.uid() = user_id);
