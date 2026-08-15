-- ─────────────────────────────────────────────────────────────────────────────
-- Device cap for paid accounts.
--
-- A lifetime purchase could be handed round indefinitely: nothing tied an
-- entitlement to a number of installations. This records which installs use an
-- account and lets the caller keep only the most recently active ones.
--
-- Eviction is implicit rather than a stored flag: an install has access while
-- it ranks within the N most-recently-seen for that user. Someone replacing a
-- phone drifts to the bottom and falls off on their own, with nothing to clean
-- up; a shared account keeps bumping its members out of the window.
--
-- RLS is enabled with NO policies: clients never touch this directly, only the
-- Edge Function (service role) does.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_devices (
    user_id     uuid        not null references auth.users(id) on delete cascade,
    install_id  text        not null,
    last_seen   timestamptz not null default now(),
    first_seen  timestamptz not null default now(),
    primary key (user_id, install_id)
);

alter table public.user_devices enable row level security;

create index if not exists user_devices_recent_idx
    on public.user_devices (user_id, last_seen desc);

comment on table public.user_devices is
    'Installs seen per account. Access is granted to the N most recently active; see touch_device.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Records an install as active and reports where it now ranks for that user,
-- 1 being the most recent.
--
-- The cap itself is deliberately not a parameter: the caller compares against
-- its own constant, so a tampered client cannot widen its own allowance.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_device(p_user_id uuid, p_install_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rank integer;
begin
    insert into public.user_devices (user_id, install_id)
    values (p_user_id, p_install_id)
    on conflict (user_id, install_id)
    do update set last_seen = now();

    select position into v_rank
    from (
        select install_id,
               row_number() over (order by last_seen desc, first_seen desc) as position
          from public.user_devices
         where user_id = p_user_id
    ) ranked
    where ranked.install_id = p_install_id;

    return coalesce(v_rank, 1);
end;
$$;

revoke all on function public.touch_device(uuid, text) from public, anon, authenticated;
