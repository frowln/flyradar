-- Card text moves from three single-language columns to one per-language map.
--
-- `summary`, `facts` and `photos` could only ever hold one language's text,
-- which is wrong for a product shipped in six. `content` is keyed by language
-- and filled the first time a route needs the place, so the second flight over
-- it costs no network at all.
--
-- Dropping them loses nothing: the columns were empty on every row.

ALTER TABLE "POI" DROP COLUMN IF EXISTS "summary";
ALTER TABLE "POI" DROP COLUMN IF EXISTS "facts";
ALTER TABLE "POI" DROP COLUMN IF EXISTS "photos";
ALTER TABLE "POI" ADD COLUMN IF NOT EXISTS "content" JSONB NOT NULL DEFAULT '{}';
