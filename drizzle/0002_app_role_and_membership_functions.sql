-- Custom migration (hand-written; Drizzle does not manage roles, grants or functions).
--
-- 1. app_user: the role the app runs its queries as. lib/db/client.ts switches to it
--    inside every transaction, so RLS policies apply. Supabase's Data API can only act
--    as anon, authenticated or service_role, so nothing granted here is reachable with
--    the publishable key. See DECISIONS.md, entry 43.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT app_user TO %I', current_user);
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

-- 2. The signed-in user's id, from the claims lib/db/client.ts sets for the transaction.
--    app_user has no access to the auth schema, so policies use this instead of auth.uid().
CREATE FUNCTION public.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
--> statement-breakpoint

-- 3. Membership checks used by every RLS policy. SECURITY DEFINER so that a policy on
--    memberships can call them without recursing into itself; empty search_path so a
--    caller cannot substitute their own objects.
CREATE FUNCTION public.is_member(loc uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.location_id = loc
      AND m.user_id = public.current_user_id()
  )
$$;
--> statement-breakpoint
CREATE FUNCTION public.has_role(loc uuid, roles public.member_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.location_id = loc
      AND m.user_id = public.current_user_id()
      AND m.role = ANY (roles)
  )
$$;
--> statement-breakpoint

-- 4. Team list with e-mail addresses, for the settings screen. E-mails live in
--    auth.users, which app_user cannot read; owners and managers get them through here.
CREATE FUNCTION public.list_location_members(loc uuid)
RETURNS TABLE (user_id uuid, email text, role public.member_role, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.user_id, u.email::text, m.role, m.created_at
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.location_id = loc
    AND public.has_role(loc, ARRAY['owner', 'manager']::public.member_role[])
  ORDER BY m.created_at
$$;
--> statement-breakpoint

-- 5. Look up an existing account by e-mail, so an owner can add someone who already
--    has an account. Only an owner of the location may ask.
CREATE FUNCTION public.find_user_id_by_email(loc uuid, lookup_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(lookup_email))
    AND public.has_role(loc, ARRAY['owner']::public.member_role[])
  LIMIT 1
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.current_user_id() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_member(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.has_role(uuid, public.member_role[]) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_location_members(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.find_user_id_by_email(uuid, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_user_id() TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.member_role[]) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_location_members(uuid) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(uuid, text) TO app_user;
--> statement-breakpoint

-- 6. Table privileges for the tenancy tables. Organizations and locations are created
--    only by the sign-up bootstrap (admin connection), so app_user gets no INSERT there.
GRANT SELECT, UPDATE ON public.organizations TO app_user;
--> statement-breakpoint
GRANT SELECT, UPDATE ON public.locations TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO app_user;
