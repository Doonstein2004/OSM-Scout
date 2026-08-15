-- The previous definition aliased the window result as `position`, which is
-- also a built-in Postgres function. Creating the function accepted it, but
-- plpgsql resolves identifiers at execution time, so the ambiguity would only
-- have surfaced the first time a paying customer opened the app.
--
-- Renamed to something unambiguous, and the lookup is now qualified.

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

    select ranked.slot
      into v_rank
      from (
            select d.install_id,
                   row_number() over (order by d.last_seen desc, d.first_seen desc) as slot
              from public.user_devices d
             where d.user_id = p_user_id
           ) ranked
     where ranked.install_id = p_install_id;

    return coalesce(v_rank, 1);
end;
$$;

revoke all on function public.touch_device(uuid, text) from public, anon, authenticated;
