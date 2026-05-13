-- Prevent duplicate subcontractor phones (digits-only form). Pre-flight: zero duplicate raw phones.
-- Uses [^0-9] for PostgreSQL regexp (\D is not reliable in regexp_replace here).
-- Note: +13305999090 vs 3305999090 become different digit strings; receive-sms matches last 10 digits in JS.

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractors_phone_unique
  ON public.subcontractors ((regexp_replace(trim(phone), '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL
    AND btrim(phone) <> ''
    AND length(regexp_replace(trim(phone), '[^0-9]', '', 'g')) > 0;
