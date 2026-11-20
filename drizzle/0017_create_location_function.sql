-- Custom migration (hand-written): an owner adds a location to their
-- organization from the app (stage 7, DECISIONS.md 98). The app role may not
-- insert locations (DECISIONS.md 43), so this is the one way in: it checks
-- that the caller owns a location of the organization, checks the name and
-- the timezone, creates the location and makes the caller its owner.
CREATE FUNCTION public.create_location(org uuid, location_name text, tz text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := public.current_user_id();
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.locations l ON l.id = m.location_id
    WHERE m.user_id = me AND m.role = 'owner' AND l.org_id = org
  ) THEN
    RAISE EXCEPTION 'NOT_AN_OWNER' USING ERRCODE = '42501';
  END IF;
  IF location_name IS NULL OR length(trim(location_name)) = 0 OR length(trim(location_name)) > 80 THEN
    RAISE EXCEPTION 'BAD_NAME' USING ERRCODE = '22023';
  END IF;
  IF tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = tz) THEN
    RAISE EXCEPTION 'BAD_TIMEZONE' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.locations (org_id, name, timezone) VALUES (org, trim(location_name), tz) RETURNING id INTO new_id;
  INSERT INTO public.memberships (user_id, location_id, role) VALUES (me, new_id, 'owner');
  RETURN new_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_location(uuid, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_location(uuid, text, text) TO app_user;
