-- ─────────────────────────────────────────────────────────────────────────────
-- Server-enforced daily search quota.
--
-- Until now the counter lived in AsyncStorage on the device, so anyone could
-- clear the app storage (or edit the value) and get a fresh set of free
-- searches. This table moves the counter server-side.
--
-- `subject` is the identity the quota is charged to:
--   • native → a stable device id (ANDROID_ID / iOS vendor id), which survives
--     clearing app data, so the quota survives with it
--   • web    → the Supabase user id
--
-- RLS is enabled with NO policies: clients can never read or write this table
-- directly. Only the `consume-search` Edge Function (service role) touches it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.search_quota (
    subject     text        not null,
    quota_date  date        not null,
    count       integer     not null default 0,
    updated_at  timestamptz not null default now(),
    primary key (subject, quota_date)
);

alter table public.search_quota enable row level security;

-- Deliberately no policies: service role bypasses RLS, everyone else is denied.

-- Lets us prune old rows cheaply.
create index if not exists search_quota_date_idx
    on public.search_quota (quota_date);

comment on table public.search_quota is
    'Daily free-tier search counter, enforced server-side by the consume-search Edge Function.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic increment. Returns the count AFTER incrementing.
--
-- The daily limit is NOT a parameter on purpose — the caller (Edge Function)
-- decides whether the returned count exceeds the limit. Keeping the limit out
-- of the SQL means a compromised client can never raise its own ceiling.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bump_search_quota(p_subject text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    insert into public.search_quota (subject, quota_date, count)
    values (p_subject, (now() at time zone 'utc')::date, 1)
    on conflict (subject, quota_date)
    do update set count      = public.search_quota.count + 1,
                  updated_at = now()
    returning count into v_count;

    return v_count;
end;
$$;

revoke all on function public.bump_search_quota(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Read the current count without incrementing (used to render "3/5" on load).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.peek_search_quota(p_subject text)
returns integer
language sql
security definer
set search_path = public
as $$
    select coalesce(
        (select count
           from public.search_quota
          where subject    = p_subject
            and quota_date = (now() at time zone 'utc')::date),
        0
    );
$$;

revoke all on function public.peek_search_quota(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Web purchase recovery map.
--
-- Stripe collects an email at checkout. Recording it against the RevenueCat
-- app_user_id lets a user who lost their local session prove ownership (via
-- email OTP) and have the entitlement re-granted to their new identity.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.web_purchases (
    id                 uuid        primary key default gen_random_uuid(),
    email              text        not null,
    rc_user_id         text        not null,
    plan               text        not null check (plan in ('pro', 'lifetime')),
    stripe_session_id  text        unique,
    created_at         timestamptz not null default now()
);

alter table public.web_purchases enable row level security;

-- Same as above: no policies. Only Edge Functions (service role) may touch it.

create index if not exists web_purchases_email_idx
    on public.web_purchases (lower(email));

comment on table public.web_purchases is
    'Maps the Stripe checkout email to the RevenueCat app_user_id so a purchase can be recovered after local storage is lost.';
