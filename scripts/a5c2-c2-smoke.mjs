// A5-c.2 C2-2 deals subsystem smoke tests — runtime RLS behavior verification.
// Usage (from repo root): node scripts/a5c2-c2-smoke.mjs
//
// Target: branch project clqgnnydrwpgxvipyotd only.
// Branch deal-child tables (deal_activity_events, deal_documents, deal_notes,
// deal_proforma_versions, deal_workspace_context) currently have 0 rows, so this
// script tests RLS shape on `public.deals` (4 rows: 2 HSH, 2 OrgB) only.
// Deal-child tables get exercised via the manual app smoke on prod where they
// have real data and complete schemas.
//
// Exits 0 if all tests pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js';

const BRANCH_URL = 'https://clqgnnydrwpgxvipyotd.supabase.co';
const ANON_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscWdubnlkcndwZ3h2aXB5b3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDIxMjksImV4cCI6MjA5MjYxODEyOX0.DH9Dk9sgsw3JlZvGy5U9x_wVljnli2mSaEFIis7zuQw';

const HSH_UUID  = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
const ORGB_UUID = '444df8c1-875b-4843-8a09-2c2e69a4bcab';

const USERS = {
  hsh:   { email: 'hsh-user@hsh-test.example',   password: 'HshTest!123' },
  orgb:  { email: 'testuser-b@hsh-test.example', password: 'OrgBTest!123' },
  noOrg: { email: 'noorg-user@hsh-test.example', password: 'NoOrg!123' },
};

const results = [];
function record(id, desc, pass, detail) {
  results.push({ id, desc, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} — ${desc}`);
  console.log('        ' + JSON.stringify(detail));
}

async function signIn(client, creds, label) {
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) { console.error(`FATAL: signIn for ${label} failed:`, error.message); process.exit(2); }
}

async function main() {
  const h     = createClient(BRANCH_URL, ANON_KEY);
  const b     = createClient(BRANCH_URL, ANON_KEY);
  const noOrg = createClient(BRANCH_URL, ANON_KEY);

  await signIn(h,     USERS.hsh,   'hsh-user');
  await signIn(b,     USERS.orgb,  'testuser-b');
  await signIn(noOrg, USERS.noOrg, 'noorg-user');

  // ---- D1: SELECT isolation on deals ----
  {
    const [hD, bD, nD] = await Promise.all([
      h.from('deals').select('id,organization_id_uuid'),
      b.from('deals').select('id,organization_id_uuid'),
      noOrg.from('deals').select('id'),
    ]);
    const hUuids = (hD.data || []).map(r => r.organization_id_uuid);
    const bUuids = (bD.data || []).map(r => r.organization_id_uuid);
    const pass =
      hUuids.length > 0 && hUuids.every(u => u === HSH_UUID) &&
      bUuids.length > 0 && bUuids.every(u => u === ORGB_UUID) &&
      (nD.data || []).length === 0 && nD.error === null;
    record('D1', 'SELECT isolation on deals', pass, {
      hshCount: hUuids.length, hshUuidsUnique: [...new Set(hUuids)],
      orgbCount: bUuids.length, orgbUuidsUnique: [...new Set(bUuids)],
      noOrgCount: (nD.data || []).length, noOrgError: nD.error?.message ?? null,
    });
  }

  // ---- D2: cross-org UPDATE on deals blocked ----
  {
    // Find one OrgB deal and one HSH deal (using each user's own SELECT visibility).
    const [hSelf, bSelf] = await Promise.all([
      h.from('deals').select('id').limit(1),
      b.from('deals').select('id').limit(1),
    ]);
    const hOwnId = hSelf.data?.[0]?.id;
    const bOwnId = bSelf.data?.[0]?.id;
    if (!hOwnId || !bOwnId) {
      record('D2', 'cross-org UPDATE on deals blocked', false, { reason: 'could not locate own deals to seed cross-org test', hOwnId, bOwnId });
    } else {
      // HSH attempts to update an OrgB deal (OrgB's own id), and vice versa.
      const [hCross, bCross] = await Promise.all([
        h.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', bOwnId).select('id'),
        b.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', hOwnId).select('id'),
      ]);
      const hRows = (hCross.data || []).length;
      const bRows = (bCross.data || []).length;
      record('D2', 'cross-org UPDATE on deals blocked', hRows === 0 && bRows === 0, {
        hshTargetingOrgbDeal: bOwnId, hshRowsUpdated: hRows, hshErr: hCross.error?.message ?? null,
        orgbTargetingHshDeal: hOwnId, orgbRowsUpdated: bRows, orgbErr: bCross.error?.message ?? null,
      });
    }
  }

  // ---- D3: invite-first INSERT into deals blocked ----
  {
    const noOrgInsert = await noOrg.from('deals').insert({
      name: `noorg deal should fail ${Date.now()}`,
      organization_id: 'default-org',
    }).select('id');
    const rows = (noOrgInsert.data || []).length;
    record('D3', 'invite-first INSERT into deals blocked', rows === 0, {
      rowsInserted: rows, error: noOrgInsert.error?.message ?? null,
    });
  }

  // ---- D4: positive control — HSH UPDATE own deal ----
  {
    const hSelf = await h.from('deals').select('id').eq('organization_id_uuid', HSH_UUID).limit(1);
    const hOwnId = hSelf.data?.[0]?.id;
    if (!hOwnId) {
      record('D4', 'positive control: HSH UPDATE own deal', false, { reason: 'no HSH-owned deal found' });
    } else {
      const upd = await h.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', hOwnId).select('id');
      const rows = (upd.data || []).length;
      record('D4', 'positive control: HSH UPDATE own deal', rows === 1, {
        targetId: hOwnId, rowsUpdated: rows, error: upd.error?.message ?? null,
      });
    }
  }

  // ---- Summary ----
  const failed = results.filter(r => !r.pass);
  console.log('\n================');
  console.log(`RESULT: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.id}: ${f.desc}`);
    process.exit(1);
  } else {
    console.log('ALL GREEN');
    process.exit(0);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(2); });
