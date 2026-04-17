-- ============================================================================
-- Auth helpers for org invites
-- ============================================================================
-- The invite-member flow needs to look up a user id by email, but `auth.users`
-- is not directly readable by the authenticated role. This helper wraps that
-- lookup in a security-definer function, so a signed-in user can invite by
-- email without granting broad SELECT access to auth.users.
--
-- Only returns a single scalar (the uuid), never the email or any other
-- column, so it can't be abused for email enumeration beyond "does a user
-- with this exact email exist".
-- ============================================================================

create or replace function public.lookup_user_id_by_email(p_email text)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id as user_id
    from auth.users
   where lower(email) = lower(p_email)
   limit 1
$$;

-- Only authenticated users can invoke it.
revoke all on function public.lookup_user_id_by_email(text) from public, anon;
grant execute on function public.lookup_user_id_by_email(text) to authenticated;
