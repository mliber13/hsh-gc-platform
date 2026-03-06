# Restore a project so it appears in GC Platform

## Why a job can disappear from GC

GC Platform **hides** (does not delete) projects when either:

- `metadata.app_scope === 'DRYWALL_ONLY'`, or  
- `metadata.visibility.gc === false`

If you create or manage a project (e.g. create a quote) in the **drywall app**, that app may set one of these on the project. The project stays in the database but no longer appears in the GC Platform project list.

## Option 1: Show all drywall-only projects in GC (temporary)

Set this in your `.env` (or Vite env):

```env
VITE_INCLUDE_DRYWALL_ONLY_PROJECTS=true
```

After rebuilding/refreshing, GC will show all projects, including those marked drywall-only. Use this to find the missing job, then either fix its metadata (Option 2) or leave the flag on if you want to always see them.

## Option 2: Restore one project in the database (permanent)

Run the following in **Supabase → SQL Editor**.

**1. List projects that are hidden from GC**

```sql
SELECT id, name, metadata
FROM projects
WHERE (metadata->>'app_scope') = 'DRYWALL_ONLY'
   OR (metadata->'visibility'->>'gc') = 'false'
ORDER BY name;
```

**2. Restore a project by ID**

Replace `'YOUR_PROJECT_ID_HERE'` with the project UUID from step 1.

```sql
UPDATE projects
SET metadata = jsonb_set(
  COALESCE(metadata - 'app_scope', metadata),
  '{visibility,gc}',
  'true'::jsonb,
  true
)
WHERE id = 'YOUR_PROJECT_ID_HERE'
  AND (
    (metadata->>'app_scope') = 'DRYWALL_ONLY'
    OR (metadata->'visibility'->>'gc') = 'false'
  );
```

**3. Or restore by project name**

Replace `'Your Project Name'` with the exact or partial name (adjust `ILIKE` as needed).

```sql
UPDATE projects
SET metadata = jsonb_set(
  COALESCE(metadata - 'app_scope', metadata),
  '{visibility,gc}',
  'true'::jsonb,
  true
)
WHERE name ILIKE '%Your Project Name%'
  AND (
    (metadata->>'app_scope') = 'DRYWALL_ONLY'
    OR (metadata->'visibility'->>'gc') = 'false'
  );
```

After running the update, refresh GC Platform; the job should appear again.

## Preventing this in the future

In the **drywall app**, avoid setting `metadata.app_scope = 'DRYWALL_ONLY'` or `metadata.visibility.gc = false` when creating or editing a quote for a project that should remain visible in GC. If both apps share the same project, only set drywall-only when the project is truly drywall-only and should never appear in GC.
