-- What the join page needs on top of the foundation.

-- ---------------------------------------------------------------------------
-- People by name
-- ---------------------------------------------------------------------------
-- Memberships and requests already point at the account. Pointing them at the profile as well
-- lets the apps ask for "the members of this space, with their names" in one request.
-- Every account has a profile: the new-user trigger creates it.

alter table public.memberships
  add constraint memberships_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.access_requests
  add constraint access_requests_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Invite codes on a join page
-- ---------------------------------------------------------------------------
-- A code typed on a space's join page must be that space's code. Without this, a code for
-- another space would quietly join the person there instead. The join page passes its space.
-- A code for a different space gets the same answer as a code that does not exist, so codes
-- still cannot be probed.

drop function public.redeem_invite(text);

create function public.redeem_invite(p_code text, p_space uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code public.invite_codes;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_code
    from public.invite_codes c
   where c.code = upper(btrim(coalesce(p_code, '')))
     for update;
  if not found
     or (p_space is not null and v_code.space_id <> p_space)
     or v_code.revoked
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses is not null and v_code.used_count >= v_code.max_uses) then
    raise exception 'invite_invalid';
  end if;

  perform private.ensure_membership(v_code.space_id);

  if exists (
    select 1 from public.invite_redemptions d where d.code_id = v_code.id and d.user_id = v_uid
  ) then
    raise exception 'invite_already_used';
  end if;

  insert into public.invite_redemptions (code_id, user_id) values (v_code.id, v_uid);
  update public.invite_codes c set used_count = c.used_count + 1 where c.id = v_code.id;
  v_until := private.extend_vip(v_code.space_id, v_uid, v_code.days);

  return jsonb_build_object('space_id', v_code.space_id, 'vip_until', v_until);
end;
$$;

revoke all on function public.redeem_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite(text, uuid) to authenticated, service_role;
