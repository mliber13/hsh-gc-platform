-- ============================================================================
-- Purchase Orders (PO) - Option A: snapshot estimate lines, assign to sub
-- ============================================================================
-- One PO per subcontractor per project. Lines are snapshots (description, qty, unit, amount).
-- PO amount rule: use subcontractor cost from the selected estimate line.
--

-- PO headers: one per sub per project
CREATE TABLE po_headers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE RESTRICT,

  po_number TEXT,                    -- Set when issued (e.g. PO-2025-001)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  issued_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_po_headers_project_sub ON po_headers(project_id, subcontractor_id);
CREATE INDEX idx_po_headers_project_id ON po_headers(project_id);
CREATE INDEX idx_po_headers_subcontractor_id ON po_headers(subcontractor_id);
CREATE INDEX idx_po_headers_status ON po_headers(status);

ALTER TABLE po_headers ENABLE ROW LEVEL SECURITY;

-- RLS: user can access PO if they can access the project (same org)
CREATE POLICY "Users can view PO for org projects"
  ON po_headers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id = get_user_organization()
        AND is_user_active()
    )
  );

CREATE POLICY "Users can insert PO for org projects"
  ON po_headers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

CREATE POLICY "Users can update PO for org projects"
  ON po_headers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

CREATE POLICY "Users can delete PO for org projects"
  ON po_headers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

-- PO lines: snapshot of estimate line (description, quantity, unit, unit_price, amount)
CREATE TABLE po_lines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES po_headers(id) ON DELETE CASCADE,

  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- extended (qty * unit_price) or snapshot sub cost

  -- Optional: link back to source estimate line (for reference only)
  source_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  source_sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_lines_po_id ON po_lines(po_id);
CREATE INDEX idx_po_lines_sort ON po_lines(po_id, sort_order);

ALTER TABLE po_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PO lines when they can view the PO"
  ON po_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM po_headers ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id = get_user_organization()
        AND is_user_active()
    )
  );

CREATE POLICY "Users can insert PO lines when they can edit the PO"
  ON po_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM po_headers ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

CREATE POLICY "Users can update PO lines when they can edit the PO"
  ON po_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM po_headers ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

CREATE POLICY "Users can delete PO lines when they can edit the PO"
  ON po_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM po_headers ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id = get_user_organization()
        AND user_can_edit()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_po_headers_updated_at
  BEFORE UPDATE ON po_headers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_po_lines_updated_at
  BEFORE UPDATE ON po_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE po_headers IS 'Purchase orders: one per subcontractor per project (Option A – amounts from estimate sub cost)';
COMMENT ON TABLE po_lines IS 'Snapshot of estimate lines on a PO; amount = subcontractor cost at time of create';
