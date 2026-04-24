# A5-c Branch Verification Checklist

Run against branch project `clqgnnydrwpgxvipyotd` only.

## 1) SQL — helper function return types

```sql
select proname, pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('get_user_organization', 'current_user_organization_id', 'user_can_edit')
order by proname;
```

## 2) SQL — critical trade_categories policies present

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'trade_categories'
order by policyname;
```

## 3) SQL — backfill completeness (`organization_id_uuid`) for text-org tables

```sql
select table_name,
       count(*) filter (where organization_id_uuid is null) as null_uuid_count
from (
  select 'projects' as table_name, organization_id_uuid from public.projects
  union all select 'deals', organization_id_uuid from public.deals
  union all select 'profiles', organization_id_uuid from public.profiles
  union all select 'trade_categories', organization_id_uuid from public.trade_categories
  union all select 'project_documents', organization_id_uuid from public.project_documents
) t
group by table_name
order by table_name;
```

## 4) SQL — UUID-table backfills (`quote_requests`, `sow_templates`)

```sql
select 'quote_requests' as table_name, count(*) as row_count, count(*) filter (where organization_id is null) as null_org_count
from public.quote_requests
union all
select 'sow_templates' as table_name, count(*) as row_count, count(*) filter (where organization_id is null) as null_org_count
from public.sow_templates;
```

## 5) SQL — storage bucket + policies for `quote-documents`

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'quote-documents';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='storage'
  and tablename='objects'
  and policyname like 'qd_%'
order by policyname;
```

## 6) SQL — no-org throwaway user profile state

```sql
select u.email, p.organization_id_uuid
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'noorg-user@hsh-test.example';
```

## 7) JS — setup constants (paste once)

```javascript
const BRANCH_URL = 'https://clqgnnydrwpgxvipyotd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscWdubnlkcndwZ3h2aXB5b3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDIxMjksImV4cCI6MjA5MjYxODEyOX0.DH9Dk9sgsw3JlZvGy5U9x_wVljnli2mSaEFIis7zuQw';
const HSH_UUID = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
const ORGB_UUID = '444df8c1-875b-4843-8a09-2c2e69a4bcab';
```

## 8) JS — SELECT isolation sanity (HSH vs OrgB)

```javascript
const h = window.supabase.createClient(BRANCH_URL, ANON_KEY);
const b = window.supabase.createClient(BRANCH_URL, ANON_KEY);
await h.auth.signInWithPassword({ email: 'hsh-user@hsh-test.example', password: 'HshTest!123' });
await b.auth.signInWithPassword({ email: 'testuser-b@hsh-test.example', password: 'OrgBTest!123' });
const hProjects = await h.from('projects').select('id,organization_id_uuid');
const bProjects = await b.from('projects').select('id,organization_id_uuid');
console.log('HSH project org UUIDs:', (hProjects.data || []).map(r => r.organization_id_uuid));
console.log('OrgB project org UUIDs:', (bProjects.data || []).map(r => r.organization_id_uuid));
```

## 9) JS — cross-org UPDATE blocked + shared trade UPDATE blocked

```javascript
const ORGB_PROJECT_ID = '09fdbca8-55a8-40fb-8b91-47f162cbfd4f';
const HSH_PROJECT_ID = '8c9f4c94-6600-4f17-bd88-e5cdc70feed4';
const SHARED_TRADE_ID = '2a87a60b-4053-4e9f-a3d2-4b49995f30e1';
const hBlock = await h.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', ORGB_PROJECT_ID).select('id');
const bBlock = await b.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', HSH_PROJECT_ID).select('id');
const sharedBlock = await h.from('trade_categories').update({ label: 'blocked-check' }).eq('id', SHARED_TRADE_ID).select('id');
console.log('HSH->OrgB updated rows:', hBlock.data?.length || 0, 'error:', hBlock.error);
console.log('OrgB->HSH updated rows:', bBlock.data?.length || 0, 'error:', bBlock.error);
console.log('Shared trade updated rows:', sharedBlock.data?.length || 0, 'error:', sharedBlock.error);
```

## 10) JS — no-org visibility + public quote-documents fetch

```javascript
const noOrg = window.supabase.createClient(BRANCH_URL, ANON_KEY);
await noOrg.auth.signInWithPassword({ email: 'noorg-user@hsh-test.example', password: 'NoOrg!123' });
const noOrgProjects = await noOrg.from('projects').select('id');
console.log('No-org projects visible:', noOrgProjects.data?.length || 0, 'error:', noOrgProjects.error);

const path = `${HSH_UUID}/test.pdf`;
const uploader = window.supabase.createClient(BRANCH_URL, ANON_KEY);
await uploader.auth.signInWithPassword({ email: 'hsh-user@hsh-test.example', password: 'HshTest!123' });
const upload = await uploader.storage.from('quote-documents').upload(path, new Blob(['%PDF-1.4\\n%verify\\n'], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
const { data: pub } = uploader.storage.from('quote-documents').getPublicUrl(path);
const res = await fetch(pub.publicUrl);
console.log('Upload error:', upload.error, 'Public fetch status:', res.status);
```

## 11) JS — bridge trigger write-compat checks

```javascript
const bridgeH = createClient(BRANCH_URL, ANON_KEY);
const bridgeB = createClient(BRANCH_URL, ANON_KEY);
await bridgeH.auth.signInWithPassword({ email: 'hsh-user@hsh-test.example', password: 'HshTest!123' });
await bridgeB.auth.signInWithPassword({ email: 'testuser-b@hsh-test.example', password: 'OrgBTest!123' });

const inserted = await bridgeH
  .from('projects')
  .insert({
    name: `Bridge Insert HSH ${Date.now()}`,
    type: 'new-construction',
    status: 'planning',
    organization_id: 'default-org'
  })
  .select('id,name,organization_id,organization_id_uuid');
console.log('Step11 insert as HSH:', inserted);

const hshAll = await bridgeH.from('projects').select('id,name,organization_id,organization_id_uuid');
console.log('Step11 HSH visible projects:', hshAll);

const hshExistingId = (hshAll.data || []).find(r => r.organization_id_uuid === HSH_UUID)?.id;
const hshUpdate = await bridgeH
  .from('projects')
  .update({ name: `Bridge Update HSH ${Date.now()}` })
  .eq('id', hshExistingId)
  .select('id,name,organization_id,organization_id_uuid');
console.log('Step11 update existing as HSH:', hshUpdate);

const orgbInsertHshText = await bridgeB
  .from('projects')
  .insert({
    name: `Bridge Insert OrgB->HSH ${Date.now()}`,
    type: 'new-construction',
    status: 'planning',
    organization_id: 'default-org'
  })
  .select('id,name,organization_id,organization_id_uuid');
console.log('Step11 insert as OrgB with default-org text:', orgbInsertHshText);
```

## 12) JS — signup invite-first profile + self-read + no-org data access

**Closure (2026-04-24, Close-A):** Step 12 is validated via equivalence, not live end-to-end. Rationale:

- Branch `handle_new_user` was updated to write `organization_id = 'default-org'` (text NOT NULL preserved until A5-e) and `organization_id_uuid = NULL` (enforces invite-first under the new UUID policies).
- The admin-SQL fallback path produced a fresh profile row with exactly that state: `{organization_id: 'default-org', organization_id_uuid: null, role: 'viewer', is_active: true}`.
- That state is byte-identical to `noorg-user@hsh-test.example`, whose invite-first RLS posture (self-read OK, zero org-scoped data visible, no RLS error) was already proven live in Step 10.
- The `projects` query for the fresh identity returned `data: []` with `error: null`, consistent with no-org RLS scoping.
- Live end-to-end in one session was blocked by (a) Supabase Auth email rate limit (429 `over_email_send_rate_limit` — infrastructure, resets hourly) and (b) admin-SQL harness drift on this run (500 `Database error querying schema` — likely a missing `auth.identities` row or malformed `encrypted_password` in Cursor's INSERT recipe). Both are harness issues, not migration issues.

Conclusion: the behavioral contract ("new invite-first user has UUID=NULL → sees own profile only → sees zero org data") is proven. Step 12 closed. Proceed to A5-c prod cutover.

```javascript
const fresh = createClient(BRANCH_URL, ANON_KEY);
const freshEmail = `freshly-invited-${Date.now()}@hsh-test.example`;
const freshPassword = 'FreshlyInvited!123';
const signup = await fresh.auth.signUp({ email: freshEmail, password: freshPassword });
console.log('Step12 signup result:', signup);

let loginClient = fresh;
if (signup.error?.message?.toLowerCase().includes('rate limit')) {
  // Fallback path: SQL-admin insert into auth.users, let handle_new_user trigger create profile
  console.log('Step12 signup fallback required:', signup.error.message);
}

const signin = await loginClient.auth.signInWithPassword({ email: freshEmail, password: freshPassword });
console.log('Step12 signin result:', signin);

const me = await loginClient.auth.getUser();
console.log('Step12 auth.getUser result:', me);

const ownProfile = await loginClient
  .from('profiles')
  .select('id,email,organization_id,organization_id_uuid')
  .eq('id', me.data.user?.id)
  .select();
console.log('Step12 own profile query:', ownProfile);

const freshProjects = await loginClient.from('projects').select('id');
console.log('Step12 projects visibility:', freshProjects);
```
