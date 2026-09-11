-- Registration capacity and OTP rate-limit cleanup.
--
-- This function keeps the final "20 official users" check inside one database
-- transaction. The advisory transaction lock serializes concurrent registration
-- inserts so two requests cannot both observe 19 users and create users 20 + 21.

create or replace function public.register_user_with_capacity(
  p_id text,
  p_email text,
  p_name text,
  p_password_salt text,
  p_password_hash text,
  p_auth_version integer,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_max_users integer
)
returns setof public.users
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_max_users is null or p_max_users < 1 then
    raise exception 'INVALID_MAX_REGISTERED_USERS' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(20260911, 20);

  if (select count(*) from public.users) >= p_max_users then
    raise exception 'MAX_REGISTERED_USERS_REACHED' using errcode = 'P0001';
  end if;

  return query
  insert into public.users (
    id,
    email,
    name,
    "passwordSalt",
    "passwordHash",
    "authVersion",
    "createdAt",
    "updatedAt"
  )
  values (
    p_id,
    p_email,
    p_name,
    p_password_salt,
    p_password_hash,
    p_auth_version,
    p_created_at,
    p_updated_at
  )
  returning *;
end;
$$;

revoke all on function public.register_user_with_capacity(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer
) from public;

grant execute on function public.register_user_with_capacity(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer
) to anon, authenticated, service_role;

delete from public.otp_send_attempts
where "createdAt" < now() - interval '10 minutes';
