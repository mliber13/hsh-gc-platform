// ============================================================
// A5-e storage migration: move existing objects to <HSH_UUID>/...
//
// What this does:
//   1. For each (bucket, oldPrefix → newPrefix) pair, list every object
//      and call supabase.storage.from(bucket).move(oldPath, newPath).
//   2. Re-sign signed URL columns (deal_documents.file_url,
//      selection_room_images.image_url, selection_room_spec_sheets.file_url)
//      because the JWT token is bound to the old path.
//   3. Update quote_requests.attachment_urls array (per-row).
//
// What this does NOT do (handled by sister SQL file):
//   - Bulk REPLACE on bucket-relative paths and public URLs
//     (deal_documents.file_path, selection_room_spec_sheets.file_path,
//      project_documents.file_url, trades.quote_file_url).
//
// Order of operations during maintenance window:
//   1. Take manual Supabase backup snapshot
//   2. Run THIS script: node scripts/a5e-storage-migration.mjs
//   3. Apply the bulk-SQL update file
//      (supabase/migrations/20260429_a5e_storage_paths.sql)
//   4. Apply the schema migration
//      (supabase/migrations/20260429_a5e_typeconvert.sql)
//   5. Verify + manual app smoke
//
// Idempotent: re-runnable. If an object is already at the new path,
// the move call errors gracefully and the script logs + continues.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// ---- Auto-load .env (no dotenv dependency) --------------------------------
// Reads `.env` from the current working directory and populates process.env
// for any keys not already set. Cross-platform (works in PowerShell, bash, cmd).
(function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    // Strip surrounding single or double quotes if present
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    process.env[key] = value;
  }
})();

// ---- Config ---------------------------------------------------------------

// Accept either SUPABASE_URL (server-side convention) or VITE_SUPABASE_URL
// (frontend convention used in this repo's .env) — both hold the same value.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FATAL: missing required env vars.');
  console.error(`  SUPABASE_URL (or VITE_SUPABASE_URL): ${SUPABASE_URL ? 'set' : 'MISSING'}`);
  console.error(`  SUPABASE_SERVICE_ROLE_KEY:           ${SERVICE_ROLE ? 'set' : 'MISSING'}`);
  console.error('Hint: source .env or export them before running.');
  console.error('Service role key: Supabase Dashboard → Settings → API → service_role (secret).');
  process.exit(1);
}

const HSH_UUID         = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
const MARK_USER_ID     = '7507f8ea-f694-453b-960e-3f0ea6337864';
const JENNIFER_USER_ID = 'abdcfc61-fd26-417e-8cf2-7d1ff5e52b17';

// 5-year signed URL TTL (matches existing prod URL expirations within ~1 year of original)
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

// (bucket, oldPrefix) → newPrefix pairs, derived from A5-d.3 inventory (A5D_PLAN §9.1)
const STORAGE_MOVES = [
  { bucket: 'deal-documents',     oldPrefix: 'default-org',      newPrefix: HSH_UUID },
  { bucket: 'project-documents',  oldPrefix: 'default-org',      newPrefix: HSH_UUID },
  { bucket: 'selection-images',   oldPrefix: 'default-org',      newPrefix: HSH_UUID },
  { bucket: 'quote-documents',    oldPrefix: 'default-org',      newPrefix: HSH_UUID },
  { bucket: 'quote-documents',    oldPrefix: MARK_USER_ID,       newPrefix: HSH_UUID },
  { bucket: 'quote-attachments',  oldPrefix: MARK_USER_ID,       newPrefix: HSH_UUID },
  { bucket: 'quote-attachments',  oldPrefix: JENNIFER_USER_ID,   newPrefix: HSH_UUID },
];

// Signed-URL columns that need re-signing post-move
const SIGNED_URL_COLUMNS = [
  { table: 'deal_documents',             urlColumn: 'file_url',  bucket: 'deal-documents'   },
  { table: 'selection_room_images',      urlColumn: 'image_url', bucket: 'selection-images' },
  { table: 'selection_room_spec_sheets', urlColumn: 'file_url',  bucket: 'selection-images' }, // spec sheets share the selection-images bucket
];

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Helpers --------------------------------------------------------------

/** Recursively list every object under a prefix (Supabase storage list is paginated and 1-level only). */
async function listAllObjectsRecursive(bucket, prefix) {
  const collected = [];
  async function walk(currentPrefix) {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await sb.storage.from(bucket).list(currentPrefix, { limit, offset });
      if (error) throw new Error(`list error in ${bucket}/${currentPrefix}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        if (entry.id) {
          // file
          collected.push(currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name);
        } else {
          // folder — recurse
          const nextPrefix = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
          await walk(nextPrefix);
        }
      }
      if (data.length < limit) break;
      offset += limit;
    }
  }
  await walk(prefix);
  return collected;
}

/** Given a signed URL, extract the bucket-relative path. */
function pathFromSignedUrl(url) {
  // Expected pattern:
  //   https://<ref>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
  const m = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(\?.*)?$/);
  if (!m) return null;
  return { bucket: m[1], path: m[2] };
}

/** Replace the prefix segment of a path: "old/x/y" → "new/x/y". */
function rewritePath(path, oldPrefix, newPrefix) {
  if (!path.startsWith(oldPrefix + '/')) return null;
  return newPrefix + path.substring(oldPrefix.length);
}

// ---- Phase 1: Storage object moves ----------------------------------------

async function phase1MoveObjects() {
  console.log('\n=== Phase 1: Storage object moves ===');
  let totalAttempted = 0;
  let totalSucceeded = 0;
  let totalAlready = 0;
  let totalGhost = 0;
  let totalFailed = 0;

  for (const move of STORAGE_MOVES) {
    console.log(`\n  ${move.bucket}: ${move.oldPrefix}/ → ${move.newPrefix}/`);
    const objects = await listAllObjectsRecursive(move.bucket, move.oldPrefix);
    console.log(`    found ${objects.length} objects`);

    for (const oldPath of objects) {
      const newPath = rewritePath(oldPath, move.oldPrefix, move.newPrefix);
      if (!newPath) {
        console.warn(`    SKIP — path doesn't start with prefix: ${oldPath}`);
        continue;
      }
      totalAttempted++;
      const { error } = await sb.storage.from(move.bucket).move(oldPath, newPath);
      if (error) {
        if (/already exists|duplicate/i.test(error.message)) {
          // Idempotent — destination exists from a prior run
          totalAlready++;
          console.log(`    [already] ${oldPath}`);
        } else if (/NoSuchKey|not found|does not exist/i.test(error.message)) {
          // Ghost entry — exists in storage.objects metadata index but not in
          // the underlying storage backend (typically left over from earlier
          // tests/uploads where the object was deleted but metadata wasn't
          // cleaned up). Nothing real to move; treat as skip-and-continue.
          totalGhost++;
          console.log(`    [ghost] ${oldPath} (NoSuchKey — no actual file)`);
        } else {
          totalFailed++;
          console.error(`    [FAIL] ${oldPath}: ${error.message}`);
        }
      } else {
        totalSucceeded++;
        if (totalSucceeded % 20 === 0) console.log(`    moved ${totalSucceeded}…`);
      }
    }
  }

  console.log(`\n  Phase 1 summary: attempted=${totalAttempted} succeeded=${totalSucceeded} already=${totalAlready} ghost=${totalGhost} failed=${totalFailed}`);
  if (totalFailed > 0) {
    console.error('  Phase 1 had real failures (not ghosts). Review above and decide whether to proceed.');
    process.exit(2);
  }
}

// ---- Phase 2: Re-sign signed URL columns ----------------------------------

async function phase2ResignSignedUrls() {
  console.log('\n=== Phase 2: Re-sign signed URL columns ===');
  let totalRows = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const col of SIGNED_URL_COLUMNS) {
    console.log(`\n  ${col.table}.${col.urlColumn} (bucket=${col.bucket})`);

    const { data: rows, error } = await sb
      .from(col.table)
      .select(`id, ${col.urlColumn}`)
      .not(col.urlColumn, 'is', null);

    if (error) {
      console.error(`    [FAIL] select: ${error.message}`);
      process.exit(2);
    }

    console.log(`    found ${rows.length} rows with ${col.urlColumn} non-null`);
    totalRows += rows.length;

    for (const row of rows) {
      const oldUrl = row[col.urlColumn];
      const parsed = pathFromSignedUrl(oldUrl);
      if (!parsed) {
        console.log(`    [skip] row ${row.id}: not a signed URL we can parse`);
        totalSkipped++;
        continue;
      }

      // Determine the new path by rewriting whichever old prefix this URL had
      const oldPath = parsed.path;
      let newPath = null;
      for (const move of STORAGE_MOVES) {
        if (move.bucket !== parsed.bucket) continue;
        const candidate = rewritePath(oldPath, move.oldPrefix, move.newPrefix);
        if (candidate) { newPath = candidate; break; }
      }
      if (!newPath) {
        console.log(`    [skip] row ${row.id}: path "${oldPath}" matches no known prefix`);
        totalSkipped++;
        continue;
      }

      const { data: signed, error: signErr } = await sb.storage
        .from(col.bucket)
        .createSignedUrl(newPath, SIGNED_URL_TTL_SECONDS);
      if (signErr) {
        console.error(`    [FAIL] sign row ${row.id} path=${newPath}: ${signErr.message}`);
        process.exit(2);
      }

      const { error: updErr } = await sb
        .from(col.table)
        .update({ [col.urlColumn]: signed.signedUrl })
        .eq('id', row.id);
      if (updErr) {
        console.error(`    [FAIL] update row ${row.id}: ${updErr.message}`);
        process.exit(2);
      }
      totalUpdated++;
    }
  }

  console.log(`\n  Phase 2 summary: rows=${totalRows} updated=${totalUpdated} skipped=${totalSkipped}`);
}

// ---- Phase 3: quote_requests.attachment_urls (text[] array) ---------------

async function phase3RewriteAttachmentArrays() {
  console.log('\n=== Phase 3: Rewrite quote_requests.attachment_urls (array) ===');

  const { data: rows, error } = await sb
    .from('quote_requests')
    .select('id, attachment_urls')
    .not('attachment_urls', 'is', null);
  if (error) {
    console.error(`  [FAIL] select: ${error.message}`);
    process.exit(2);
  }

  let totalUpdated = 0;
  for (const row of rows) {
    if (!Array.isArray(row.attachment_urls) || row.attachment_urls.length === 0) continue;
    let changed = false;
    const newUrls = row.attachment_urls.map((url) => {
      // attachment_urls are public URLs in quote-attachments / quote-documents buckets
      for (const move of STORAGE_MOVES) {
        if (move.bucket !== 'quote-attachments' && move.bucket !== 'quote-documents') continue;
        const oldFragment = `/${move.bucket}/${move.oldPrefix}/`;
        const newFragment = `/${move.bucket}/${move.newPrefix}/`;
        if (url.includes(oldFragment)) {
          changed = true;
          return url.replace(oldFragment, newFragment);
        }
      }
      return url;
    });
    if (!changed) continue;

    const { error: updErr } = await sb
      .from('quote_requests')
      .update({ attachment_urls: newUrls })
      .eq('id', row.id);
    if (updErr) {
      console.error(`  [FAIL] update row ${row.id}: ${updErr.message}`);
      process.exit(2);
    }
    totalUpdated++;
  }

  console.log(`  Phase 3 summary: rows scanned=${rows.length} updated=${totalUpdated}`);
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  await phase1MoveObjects();
  await phase2ResignSignedUrls();
  await phase3RewriteAttachmentArrays();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n=== A5-e storage migration complete in ${elapsed}s ===`);
  console.log('Next: apply supabase/migrations/20260429_a5e_storage_paths.sql, then 20260429_a5e_typeconvert.sql');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
