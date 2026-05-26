-- Speed up project list queries scoped by organization (GC + Drywall dashboards).
CREATE INDEX IF NOT EXISTS idx_projects_organization_created_at
  ON public.projects (organization_id, created_at DESC);
