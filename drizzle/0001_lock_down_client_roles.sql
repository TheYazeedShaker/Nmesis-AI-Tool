-- Context: Supabase exposes the public schema through its Data API to the
-- `anon` and `authenticated` roles. The studio never uses that API: the server
-- connects directly as the database owner. RLS is already on for every table
-- with no policies (deny-by-default); this also removes the table privileges
-- Supabase grants those roles by default, so a leaked publishable key reads
-- and writes nothing. Guarded so it also runs on plain Postgres (CI, PGlite),
-- where the roles do not exist.
-- Does not change: the owner role's access (it bypasses RLS as table owner).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.films, public.film_budgets, public.swap_jobs, public.storyboards, public.image_jobs, public.topaz_jobs FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
