-- ============================================================================
-- Add attachment_names to quote_requests (display names for attachment links)
-- ============================================================================
-- Same order as attachment_urls; used in email and vendor portal for link text.
--

ALTER TABLE quote_requests
ADD COLUMN IF NOT EXISTS attachment_names TEXT[] DEFAULT '{}';

COMMENT ON COLUMN quote_requests.attachment_names IS 'Display names for attachment_urls (e.g. file names) for email and portal link text';
