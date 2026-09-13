-- Restrict the SECURITY DEFINER registration RPC to trusted server-side calls.
--
-- The public registration flow is:
-- browser -> Netlify Function -> verified OTP -> Supabase service secret -> RPC.
-- Browser roles must not be able to call this SECURITY DEFINER function directly.

revoke execute on function public.register_user_with_capacity(
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

revoke execute on function public.register_user_with_capacity(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer
) from anon;

revoke execute on function public.register_user_with_capacity(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  integer
) from authenticated;

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
) to service_role;
