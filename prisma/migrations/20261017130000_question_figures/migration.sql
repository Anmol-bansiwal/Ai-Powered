DO $$
BEGIN
  IF current_database() IS DISTINCT FROM 'edusearch_ai' THEN
    RAISE EXCEPTION 'migration refused because the connected database is not edusearch_ai';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "question_figures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "question_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "page_reference" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_figures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "question_figures"
  DROP CONSTRAINT IF EXISTS "question_figures_question_id_fkey";

ALTER TABLE "question_figures"
  ADD CONSTRAINT "question_figures_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "question_figures_question_id_url_key"
  ON "question_figures"("question_id", "url");

CREATE INDEX IF NOT EXISTS "question_figures_question_id_idx"
  ON "question_figures"("question_id");

-- Move any URLs previously stored on questions.figure_urls into the linked table.
INSERT INTO "question_figures" ("id", "question_id", "url", "page_reference", "sort_order")
SELECT
  gen_random_uuid(),
  q.id,
  fig.url,
  q.page_reference,
  fig.ord - 1
FROM "questions" q
CROSS JOIN LATERAL unnest(COALESCE(q.figure_urls, '{}'::text[]))
  WITH ORDINALITY AS fig(url, ord)
WHERE fig.url IS NOT NULL AND btrim(fig.url) <> ''
ON CONFLICT ("question_id", "url") DO NOTHING;

ALTER TABLE "questions" DROP COLUMN IF EXISTS "figure_urls";
