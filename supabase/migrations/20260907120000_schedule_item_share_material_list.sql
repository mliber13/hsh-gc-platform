-- Per-item switch to share the material list with whoever is assigned to it.
--
-- The existing `show_job_info_person_ids` already surfaces materials, but it also
-- reveals the job's sqft and labor rates — a person's pay basis. That is too much
-- for the case this is for: someone making a one-off delivery who needs the
-- material list and nothing else.
--
-- It is also vetoed today by an inferred specialty. `resolveMaterials` returns an
-- empty list when the specialty is 'unknown', which is what a driver or a
-- scaffold hand resolves to, so an explicit operator grant loses to a substring
-- match on a job title. This flag is an explicit grant and is not second-guessed.
--
-- Per item rather than per person: the occasion is the delivery, not the person.
-- Everyone assigned to that item sees the list; assignment is already the crew
-- authorization boundary everywhere else.

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS share_material_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schedule_items.share_material_list IS
  'Operator grant: show the project material list to everyone assigned to this item, '
  'regardless of their trade specialty. Materials only — never sqft or pay, which stay '
  'behind show_job_info_person_ids.';
