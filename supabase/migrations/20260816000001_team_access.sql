-- ─────────────────────────────────────────────────────────────────────────────
-- Complimentary access for teammates.
--
-- Keyed by email rather than by user id on purpose: ids are opaque and change
-- if someone reinstalls before linking an account, whereas an email is what you
-- actually know about a person and can grant or revoke without looking anything
-- up.
--
-- Being listed here does not itself unlock the app. The Edge Function reads
-- this and grants a promotional entitlement in RevenueCat, so RevenueCat stays
-- the single source of truth and the native SDK sees the access like any other
-- purchase — no second code path to keep in step.
--
-- RLS is enabled with NO policies: only the Edge Function (service role) reads
-- it. A client that could read this would learn who gets free access.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.team_access (
    email       text        primary key,
    note        text,
    granted_at  timestamptz,
    created_at  timestamptz not null default now()
);

alter table public.team_access enable row level security;

comment on table public.team_access is
    'Emails granted complimentary PRO. Add a row to grant, delete it to revoke.';
comment on column public.team_access.granted_at is
    'When the RevenueCat promotional entitlement was issued. Null until first sign-in.';

-- Emails are matched case-insensitively; store them however, compare lowered.
create unique index if not exists team_access_email_lower_idx
    on public.team_access (lower(email));
