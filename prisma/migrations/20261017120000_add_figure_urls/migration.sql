DO $$
BEGIN
  IF current_database() IS DISTINCT FROM 'edusearch_ai' THEN
    RAISE EXCEPTION 'migration refused because the connected database is not edusearch_ai';
  END IF;
END $$;

ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "figure_urls" TEXT[] NOT NULL DEFAULT '{}';
