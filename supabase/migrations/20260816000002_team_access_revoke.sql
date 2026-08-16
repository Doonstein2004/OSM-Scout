-- Records which RevenueCat account received the complimentary grant.
--
-- Without this, removing a row only stops the entitlement being re-issued: the
-- one already granted stays active forever, so "revoke" silently did nothing.
-- Storing the id makes it possible to withdraw the grant as well.

alter table public.team_access
    add column if not exists granted_to text;

comment on column public.team_access.granted_to is
    'RevenueCat app_user_id the promotional entitlement was issued to. Needed to withdraw it.';
