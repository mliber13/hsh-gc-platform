-- ============================================================================
-- Cleanup Duplicate SOW Templates
-- ============================================================================
-- 
-- Remove user-created default templates, keeping only system templates
-- (user_id IS NULL) for default templates
--

-- Delete templates with user_id that match the default template names
DELETE FROM sow_templates
WHERE user_id IS NOT NULL
  AND name IN (
    'Standard Electrical SOW',
    'Standard Plumbing SOW',
    'Standard HVAC SOW',
    'Standard Roofing SOW',
    'Standard Drywall SOW'
  );

-- Verify cleanup (optional - returns count of remaining templates)
-- SELECT name, user_id IS NULL as is_system, COUNT(*) 
-- FROM sow_templates 
-- WHERE name IN (
--   'Standard Electrical SOW',
--   'Standard Plumbing SOW',
--   'Standard HVAC SOW',
--   'Standard Roofing SOW',
--   'Standard Drywall SOW'
-- )
-- GROUP BY name, is_system
-- ORDER BY name;

