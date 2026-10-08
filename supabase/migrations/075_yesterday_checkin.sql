-- Preserve the day the swimmer is answering for separately from submission time.
ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS activity_date date,
  ADD COLUMN IF NOT EXISTS late_entry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_entry_key text;

UPDATE public.responses
SET activity_date = (created_at AT TIME ZONE 'Europe/Stockholm')::date
WHERE activity_date IS NULL;

ALTER TABLE public.responses
  ALTER COLUMN activity_date SET DEFAULT (timezone('Europe/Stockholm', now()))::date,
  ALTER COLUMN activity_date SET NOT NULL;

-- A late response is limited to one per authenticated profile and activity day.
-- The key is an HMAC generated server-side, so anonymous responses remain
-- unlinked to the swimmer's profile in the responses table.
CREATE UNIQUE INDEX IF NOT EXISTS responses_late_entry_key_unique
  ON public.responses (late_entry_key)
  WHERE late_entry_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS responses_activity_date_created_at_idx
  ON public.responses (activity_date, created_at DESC);
