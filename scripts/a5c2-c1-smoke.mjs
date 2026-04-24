// A5-c.2 C2-1 pilot smoke tests — runtime RLS behavior verification.
// Usage (from repo root): node scripts/a5c2-c1-smoke.mjs
//
// Requires: @supabase/supabase-js (already in package.json dependencies).
// Exits 0 if all tests pass, 1 otherwise.
//
// Target: branch project clqgnnydrwpgxvipyotd only.
// Uses branch test credentials documented in docs/A5C_BRANCH_VERIFICATION.md.

import { createClient } from '@supabase/supabase-js';

const BRANCH_URL = 'https://clqgnnydrwpgxvipyotd.supabase.co';
const ANON_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscWdubnlkcndwZ3h2aXB5b3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDIxMjksImV4cCI6MjA5MjYxODEyOX0.DH9Dk9sgsw3JlZvGy5U9x_wVljnli2mSaEFIis7zuQw';

const HSH_UUID        = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
const ORGB_UUID       = '444df8c1-875b-4843-8a09-2c2e69a4bcab';
const ORGB_PROJECT_ID = '09fdbca8-55a8-40fb-8b91-47f162cbfd4f';
const HSH_PROJECT_ID  = '8c9f4c94-6600-4f17-bd88-e5cdc70feed4';
const SHARED_TRADE_ID = '2a87a60b-4053-4e9f-a3d2-4b49995f30e1';

const USERS = {
  hsh:   { email: 'hsh-user@hsh-test.example',   password: 'HshTest!123' },
  orgb:  { email: 'testuser-b@hsh-test.example', password: 'OrgBTest!123' },
  noOrg: { email: 'noorg-user@hsh-test.example', password: 'NoOrg!123' },
};

const results = [];
function record(id, desc, pass, detail) {
  results.push({ id, desc, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${id} — ${desc}`);
  console.log('        ' + JSON.stringify(detail));
}

function sameSet(a, b) {
  const sa = [...a].sort(); const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

async function signIn(client, creds, label) {
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error) {
    console.error(`FATAL: signIn for ${label} failed:`, error.message);
    process.exit(2);
  }
  return data;
}

async function main() {
  const h     = createClient(BRANCH_URL, ANON_KEY);
  const b     = createClient(BRANCH_URL, ANON_KEY);
  const noOrg = createClient(BRANCH_URL, ANON_KEY);

  await signIn(h,     USERS.hsh,   'hsh-user');
  await signIn(b,     USERS.orgb,  'testuser-b');
  await signIn(noOrg, USERS.noOrg, 'noorg-user');

  // ---- S1: SELECT isolation on projects ----
  {
    const [hP, bP, nP] = await Promise.all([
      h.from('projects').select('id,organization_id_uuid'),
      b.from('projects').select('id,organization_id_uuid'),
      noOrg.from('projects').select('id'),
    ]);
    const hUuids = (hP.data || []).map(r => r.organization_id_uuid);
    const bUuids = (bP.data || []).map(r => r.organization_id_uuid);
    const pass =
      hUuids.length > 0 && hUuids.every(u => u === HSH_UUID) &&
      bUuids.length > 0 && bUuids.every(u => u === ORGB_UUID) &&
      (nP.data || []).length === 0 &&
      nP.error === null;
    record('S1', 'SELECT isolation on projects', pass, {
      hshCount: hUuids.length, hshUuidsUnique: [...new Set(hUuids)],
      orgbCount: bUuids.length, orgbUuidsUnique: [...new Set(bUuids)],
      noOrgCount: (nP.data || []).length, noOrgError: nP.error?.message ?? null,
    });
  }

  // ---- S2: trade_categories shared + org-scoped visibility ----
  {
    const [hT, bT, nT] = await Promise.all([
      h.from('trade_categories').select('id,organization_id_uuid'),
      b.from('trade_categories').select('id,organization_id_uuid'),
      noOrg.from('trade_categories').select('id,organization_id_uuid'),
    ]);
    const hTuuids = (hT.data || []).map(r => r.organization_id_uuid);
    const bTuuids = (bT.data || []).map(r => r.organization_id_uuid);
    const nTuuids = (nT.data || []).map(r => r.organization_id_uuid);
    // HSH should see 1 null (shared) + ≥1 HSH; OrgB should see 1 null + ≥1 OrgB; noOrg should see only nulls
    const hOK = hTuuids.includes(null) && hTuuids.some(u => u === HSH_UUID)  && hTuuids.every(u => u === null || u === HSH_UUID);
    const bOK = bTuuids.includes(null) && bTuuids.some(u => u === ORGB_UUID) && bTuuids.every(u => u === null || u === ORGB_UUID);
    const nOK = nTuuids.length > 0 && nTuuids.every(u => u === null);
    record('S2', 'trade_categories shared + org visibility', hOK && bOK && nOK, {
      hsh: hTuuids, orgb: bTuuids, noOrg: nTuuids,
    });
  }

  // ---- S3: cross-org UPDATE on projects blocked ----
  {
    const [hCross, bCross] = await Promise.all([
      h.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', ORGB_PROJECT_ID).select('id'),
      b.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', HSH_PROJECT_ID).select('id'),
    ]);
    const hRows = (hCross.data || []).length;
    const bRows = (bCross.data || []).length;
    const pass = hRows === 0 && bRows === 0; // errors may or may not appear — both are acceptable for silent RLS filter
    record('S3', 'cross-org UPDATE on projects blocked', pass, {
      hshToOrgbRows: hRows, hshErr: hCross.error?.message ?? null,
      orgbToHshRows: bRows, orgbErr: bCross.error?.message ?? null,
    });
  }

  // ---- S4: UPDATE on shared trade (uuid=NULL) blocked ----
  {
    const sharedBlock = await h
      .from('trade_categories')
      .update({ label: 'blocked-c21-' + Date.now() })
      .eq('id', SHARED_TRADE_ID)
      .select('id');
    const rows = (sharedBlock.data || []).length;
    record('S4', 'UPDATE on shared trade blocked', rows === 0, {
      rowsUpdated: rows, error: sharedBlock.error?.message ?? null,
    });
  }

  // ---- S5: invite-first self-profile + no cross-org profile visibility ----
  {
    const [own, hshProfiles] = await Promise.all([
      noOrg.from('profiles').select('id,email,organization_id_uuid').eq('email', USERS.noOrg.email),
      noOrg.from('profiles').select('id').eq('organization_id_uuid', HSH_UUID),
    ]);
    const ownRows  = (own.data || []).length;
    // Preserve null as null (do NOT collapse with ??) — null is the expected invite-first state.
    const ownUuid  = ownRows === 1 ? own.data[0].organization_id_uuid : undefined;
    const hshCount = (hshProfiles.data || []).length;
    const pass = ownRows === 1 && ownUuid === null && hshCount === 0;
    record('S5', 'invite-first self-profile + no cross-org profile visibility', pass, {
      ownRows, ownUuid, hshProfilesVisibleToNoOrg: hshCount,
      ownErr: own.error?.message ?? null, hshErr: hshProfiles.error?.message ?? null,
    });
  }

  // ---- S6: invite-first INSERT into projects blocked ----
  {
    const noOrgInsert = await noOrg.from('projects').insert({
      name: `noorg should fail ${Date.now()}`,
      type: 'new-construction',
      status: 'planning',
      organization_id: 'default-org',
    }).select('id');
    const rows = (noOrgInsert.data || []).length;
    const errored = !!noOrgInsert.error;
    // Either rows=0 with error OR rows=0 silently — both acceptable. Fail only if a row was actually inserted.
    record('S6', 'invite-first INSERT into projects blocked', rows === 0, {
      rowsInserted: rows, errored, error: noOrgInsert.error?.message ?? null,
    });
  }

  // ---- S7: positive control — HSH can UPDATE own project ----
  {
    const selfUpd = await h
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', HSH_PROJECT_ID)
      .select('id');
    const rows = (selfUpd.data || []).length;
    record('S7', 'positive control: HSH UPDATE own project', rows === 1, {
      rowsUpdated: rows, error: selfUpd.error?.message ?? null,
    });
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

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
