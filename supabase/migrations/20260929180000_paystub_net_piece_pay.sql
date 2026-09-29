-- What a crew member was actually paid on each job.
--
-- `pieceEntries[].amount` is the piece BEFORE the helper deduction: when a helper's hours
-- are assigned to a lead on a job, the helper's day rate comes off the lead's piece. On 27
-- of 148 locked piece rows the raw amount is therefore not what was paid, and on several of
-- them it exceeds the entire week's gross — David Busico's Kirtland - Hofius row reads
-- $4,134.94 against a $2,659.94 cheque. Printing it on the crew pay page would tell a
-- finisher the company owes him $1,475 it does not owe.
--
-- The deduction is attributed to a job, so net-per-job is exact rather than apportioned
-- guesswork. payrollMath.getHelperDeductionForJob + pieceRowHelperDeduction already do this
-- for the payroll editor; the crew page cannot, because the helper's hour rows live on the
-- HELPER's entry and filter_paystub_entries_for_person strips every entry but the caller's —
-- as it must. So the sum moves server-side, inside the definer that still sees the whole run.
--
-- Verified against all 35 locked periods: net per job sums to the stored `pieceTotal` on
-- 148 of 148 piece rows, to the cent.

BEGIN;

-- Payroll numbers are strings in the payload ("0.28", ".285", "39.375"), and a stray
-- non-numeric value would abort the whole read. Parse defensively.
CREATE OR REPLACE FUNCTION public.payroll_num(v text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN v ~ '^\s*-?(\d+\.?\d*|\.\d+)\s*$' THEN btrim(v)::numeric
    ELSE 0
  END;
$fn$;

-- Mirror of payrollMath.jobsMatch. Jobs match on id, or on name when either id is missing;
-- 'unassigned' never matches anything, including itself.
CREATE OR REPLACE FUNCTION public.payroll_jobs_match(
  a_id text, a_name text, b_id text, b_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN btrim(coalesce(a_id, '')) = '' OR btrim(coalesce(b_id, '')) = ''
      THEN lower(btrim(coalesce(a_name, ''))) <> ''
        AND lower(btrim(coalesce(a_name, ''))) = lower(btrim(coalesce(b_name, '')))
    WHEN btrim(a_id) = 'unassigned' OR btrim(b_id) = 'unassigned' THEN false
    WHEN btrim(a_id) = btrim(b_id) THEN true
    ELSE lower(btrim(coalesce(a_name, ''))) <> ''
      AND lower(btrim(coalesce(a_name, ''))) = lower(btrim(coalesce(b_name, '')))
  END;
$fn$;

-- Mirror of payrollMath.getHelperDeductionForJob. Scans every entry in the run, so it must
-- only ever be called from a definer that already owns the whole payload.
CREATE OR REPLACE FUNCTION public.payroll_helper_deduction_for_job(
  run_payload jsonb, person_key text, job_id text, job_name text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT coalesce(sum(amt), 0)
  FROM (
    SELECT public.payroll_num(h ->> 'amount') AS amt
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(run_payload -> 'entries') = 'array'
        THEN run_payload -> 'entries' ELSE '[]'::jsonb END
    ) e
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(e -> 'helperPayReceived') = 'array'
        THEN e -> 'helperPayReceived' ELSE '[]'::jsonb END
    ) h
    WHERE (h ->> 'fromPersonId') = person_key
      AND public.payroll_jobs_match(h ->> 'jobId', h ->> 'jobName', job_id, job_name)

    UNION ALL

    SELECT CASE
             WHEN public.payroll_num(he ->> 'assignRate') > 0
               THEN public.payroll_num(he ->> 'hours') * public.payroll_num(he ->> 'assignRate')
             ELSE public.payroll_num(he ->> 'assignAmount')
           END
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(run_payload -> 'entries') = 'array'
        THEN run_payload -> 'entries' ELSE '[]'::jsonb END
    ) e
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(e -> 'hourEntries') = 'array'
        THEN e -> 'hourEntries' ELSE '[]'::jsonb END
    ) he
    WHERE (he ->> 'assignToPersonId') = person_key
      AND public.payroll_jobs_match(he ->> 'jobId', he ->> 'jobName', job_id, job_name)
  ) s;
$fn$;

-- Adds `netAmount` and `helperDeduction` to each of one entry's piece rows.
--
-- The deduction is held per JOB, not per row, so a job split across several rows shares it
-- in proportion to each row's amount — the same apportionment
-- payrollMath.pieceRowHelperDeduction uses, so the two surfaces cannot disagree.
--
-- `assignToPersonId` carries the composite key (`w2-<id>` / `1099-<id>`), not the bare
-- personId the entry itself stores.
CREATE OR REPLACE FUNCTION public.paystub_entry_with_net_piece_pay(
  run_payload jsonb, entry jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_key text;
  v_pieces jsonb;
  v_out jsonb := '[]'::jsonb;
  v_pe jsonb;
  v_raw numeric;
  v_job_raw numeric;
  v_job_ded numeric;
  v_ratio numeric;
BEGIN
  IF jsonb_typeof(entry -> 'pieceEntries') <> 'array' THEN
    RETURN entry;
  END IF;

  v_key := coalesce(entry ->> 'personType', '') || '-' || coalesce(entry ->> 'personId', '');
  v_pieces := entry -> 'pieceEntries';

  FOR v_pe IN SELECT value FROM jsonb_array_elements(v_pieces) LOOP
    v_raw := public.payroll_num(v_pe ->> 'amount');

    SELECT coalesce(sum(public.payroll_num(x ->> 'amount')), 0)
    INTO v_job_raw
    FROM jsonb_array_elements(v_pieces) x
    WHERE public.payroll_jobs_match(
      x ->> 'jobId', x ->> 'jobName', v_pe ->> 'jobId', v_pe ->> 'jobName'
    );

    v_job_ded := public.payroll_helper_deduction_for_job(
      run_payload, v_key, v_pe ->> 'jobId', v_pe ->> 'jobName'
    );

    v_ratio := CASE WHEN v_job_raw > 0 THEN LEAST(1, v_job_ded / v_job_raw) ELSE 0 END;

    v_out := v_out || jsonb_build_array(
      v_pe || jsonb_build_object(
        'netAmount', round(GREATEST(0, v_raw - v_raw * v_ratio), 2),
        'helperDeduction', round(v_raw * v_ratio, 2)
      )
    );
  END LOOP;

  RETURN jsonb_set(entry, '{pieceEntries}', v_out);
END;
$fn$;

-- Unchanged in what it lets through: still only the caller's own entries. Each one now
-- carries the net figures, worked out before the other entries were discarded.
CREATE OR REPLACE FUNCTION public.filter_paystub_entries_for_person(
  run_payload jsonb,
  linked_person_id text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(
    jsonb_agg(public.paystub_entry_with_net_piece_pay(run_payload, elem) ORDER BY ord),
    '[]'::jsonb
  )
  FROM (
    SELECT elem, ord
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(run_payload -> 'entries') = 'array' THEN run_payload -> 'entries'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS t(elem, ord)
    WHERE (elem ->> 'personId') = linked_person_id
  ) sub;
$fn$;

REVOKE ALL ON FUNCTION public.payroll_num(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_jobs_match(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_helper_deduction_for_job(jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paystub_entry_with_net_piece_pay(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.filter_paystub_entries_for_person(jsonb, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Verification: net piece pay must reach the stored pieceTotal on every locked
-- period. A silent drift here would show a crew member the wrong cheque.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_checked int := 0;
  v_bad int := 0;
  r record;
  v_net numeric;
BEGIN
  FOR r IN
    SELECT pp.payload AS payload, e.elem AS entry
    FROM public.pay_periods pp
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(pp.payload -> 'entries') = 'array'
        THEN pp.payload -> 'entries' ELSE '[]'::jsonb END
    ) AS e(elem)
    WHERE COALESCE(pp.payload ->> 'locked', 'false') IN ('true', 't')
      AND jsonb_typeof(e.elem -> 'pieceEntries') = 'array'
      AND jsonb_array_length(e.elem -> 'pieceEntries') > 0
  LOOP
    SELECT coalesce(sum(public.payroll_num(p ->> 'netAmount')), 0)
    INTO v_net
    FROM jsonb_array_elements(
      public.paystub_entry_with_net_piece_pay(r.payload, r.entry) -> 'pieceEntries'
    ) p;

    v_checked := v_checked + 1;
    IF abs(v_net - public.payroll_num(r.entry ->> 'pieceTotal')) > 0.02 THEN
      v_bad := v_bad + 1;
      RAISE WARNING 'paystub_net_verify: % net % vs pieceTotal %',
        r.entry ->> 'personName', v_net, r.entry ->> 'pieceTotal';
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'paystub_net_verify: % of % locked piece rows do not reconcile', v_bad, v_checked;
  END IF;

  RAISE NOTICE 'paystub_net_verify: OK — % locked piece rows reconcile to pieceTotal', v_checked;
END
$verify$;

COMMIT;
