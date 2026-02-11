-- ============================================================================
-- Add attachment_urls to quote_requests for project document attachments
-- ============================================================================
-- Allows attaching multiple project documents to a quote request (in addition
-- to the single drawings_url from file upload).
--

ALTER TABLE quote_requests
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN quote_requests.attachment_urls IS 'URLs of attached project documents (copied to quote-attachments for vendor access)';
