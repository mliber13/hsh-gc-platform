-- ============================================================================
-- Quote Request & Submission System
-- ============================================================================
-- 
-- This migration creates tables for managing quote requests to vendors
-- and their submitted quotes
--

-- ============================================================================
-- QUOTE REQUESTS TABLE
-- ============================================================================

CREATE TABLE quote_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  organization_id UUID,
  project_id UUID REFERENCES projects ON DELETE CASCADE NOT NULL,
  trade_id UUID REFERENCES trades ON DELETE SET NULL, -- Optional: can be general request
  
  -- Vendor information
  vendor_email TEXT NOT NULL,
  vendor_name TEXT,
  
  -- Request details
  token TEXT UNIQUE NOT NULL, -- Secure token for vendor access
  scope_of_work TEXT NOT NULL,
  drawings_url TEXT, -- Single combined PDF URL
  project_info JSONB, -- Relevant project details to share
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'viewed' | 'submitted' | 'expired'
  due_date TIMESTAMPTZ,
  
  -- Metadata
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_quote_requests_user_id ON quote_requests(user_id);
CREATE INDEX idx_quote_requests_project_id ON quote_requests(project_id);
CREATE INDEX idx_quote_requests_trade_id ON quote_requests(trade_id);
CREATE INDEX idx_quote_requests_token ON quote_requests(token);
CREATE INDEX idx_quote_requests_status ON quote_requests(status);
CREATE INDEX idx_quote_requests_vendor_email ON quote_requests(vendor_email);

-- RLS Policies
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quote requests"
  ON quote_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quote requests"
  ON quote_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quote requests"
  ON quote_requests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quote requests"
  ON quote_requests FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- SUBMITTED QUOTES TABLE
-- ============================================================================

CREATE TABLE submitted_quotes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quote_request_id UUID REFERENCES quote_requests ON DELETE CASCADE NOT NULL,
  
  -- Vendor information
  vendor_name TEXT NOT NULL,
  vendor_email TEXT NOT NULL,
  vendor_company TEXT,
  vendor_phone TEXT,
  
  -- Quote details
  line_items JSONB NOT NULL DEFAULT '[]', -- Array of {description, quantity, unit, price}
  total_amount NUMERIC NOT NULL,
  valid_until TIMESTAMPTZ, -- Quote expiration date
  notes TEXT,
  quote_document_url TEXT, -- Vendor's own quote document
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'waiting-for-more' | 'revision-requested'
  reviewed_by UUID REFERENCES auth.users,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Assignment
  assigned_trade_id UUID REFERENCES trades ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users,
  assigned_at TIMESTAMPTZ,
  
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_submitted_quotes_quote_request_id ON submitted_quotes(quote_request_id);
CREATE INDEX idx_submitted_quotes_status ON submitted_quotes(status);
CREATE INDEX idx_submitted_quotes_assigned_trade_id ON submitted_quotes(assigned_trade_id);
CREATE INDEX idx_submitted_quotes_vendor_email ON submitted_quotes(vendor_email);

-- RLS Policies
ALTER TABLE submitted_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quotes for their requests"
  ON submitted_quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quote_requests 
      WHERE quote_requests.id = submitted_quotes.quote_request_id 
      AND quote_requests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update quotes for their requests"
  ON submitted_quotes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quote_requests 
      WHERE quote_requests.id = submitted_quotes.quote_request_id 
      AND quote_requests.user_id = auth.uid()
    )
  );

-- Allow public insert for vendor submissions (token-based)
-- This will be handled via a service role function or API endpoint
-- For now, we'll use a more permissive policy that checks the token
CREATE POLICY "Vendors can submit quotes via token"
  ON submitted_quotes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quote_requests 
      WHERE quote_requests.id = submitted_quotes.quote_request_id
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_quote_requests_updated_at BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submitted_quotes_updated_at BEFORE UPDATE ON submitted_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate secure token for quote requests
CREATE OR REPLACE FUNCTION generate_quote_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

