// node scripts/backfill-library.mjs --env <production|preview> --staff <Nmesis staff user id> [--dry]
//
// Not an owner step any more: the Studio fills each company's index itself the
// first time its library is opened (lib/library-backfill.ts, migration 0009).
// This script stays for check:ui's seeded world and for a manual repair: fills the library index (studio.library_items)
// and makes the small thumbnails for the work saved before it: key visuals and
// their edits (saved records), image jobs, films, car swaps and stories. Safe to
// run again: every row is an upsert and a thumbnail that exists is kept.
//
// Run it once per environment, with that environment's settings, the same
// ones the Studio has on Vercel: DATABASE_URL (the studio_app role) and the
// S3_* variables of that environment's bucket. --env says which environment's
// rows to write; --staff is an Nmesis staff member's user id, because row
// level security lets only staff write for every company.
import {register} from 'node:module';
import postgres from 'postgres';

register('./verify/hooks.mjs', import.meta.url);

const args = process.argv.slice(2);
const arg = (name) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : undefined; };
const env = arg('env'), staff = arg('staff'), dry = args.includes('--dry');
if (!['production', 'preview', 'development'].includes(env || '')) throw new Error('Say which environment: --env production or --env preview.');
if (!/^[0-9a-f-]{36}$/.test(staff || '')) throw new Error('Give an Nmesis staff member\'s user id: --staff <uuid>.');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (the studio_app role) for this environment.');
process.env.VERCEL_ENV = env;

const {StudioDatabase} = await import('../lib/portable/database.ts');
const {getStorage} = await import('../lib/portable/storage.ts');
const {indexItem, indexReady, fromVisual, fromFilm, fromSwap, fromStory, plainStatus} = await import('../lib/library-index.ts');

const url = process.env.DATABASE_URL;
const sql = postgres(url, {max: 2, prepare: false, connect_timeout: 10, idle_timeout: 5, ssl: /[?&]sslmode=disable\b/.test(url) ? false : 'require', onnotice: () => {}});
const db = new StudioDatabase(sql, null, env).forUser(staff);
const store = getStorage();
if (!store) throw new Error('Set the S3_* variables for this environment\'s bucket.');
const counts = {records: 0, jobs: 0, films: 0, swaps: 0, stories: 0, thumbs: 0, problems: 0};
const orgOf = (owner) => owner.split('/')[1];

const orgs = new Set();
async function put(entry, org) {
  orgs.add(org);
  if (dry) return;
  try {
    await indexItem({DB: db, BUCKET: store, org}, entry);
    const row = await db.prepare('SELECT thumb_key FROM library_items WHERE org_id=? AND kind=? AND id=?').bind(org, entry.kind, entry.id).first();
    if (row?.thumb_key) counts.thumbs++;
  } catch (e) { counts.problems++; console.warn('Not indexed', entry.kind, entry.id, e instanceof Error ? e.message.slice(0, 120) : ''); }
}
async function* keys(prefix) {
  let cursor;
  do { const page = await store.list({prefix, limit: 1000, ...(cursor ? {cursor} : {})}); for (const o of page.objects) yield o.key; cursor = page.truncated ? page.cursor : undefined; } while (cursor);
}

try {
  if (!await indexReady(db)) throw new Error('Migration 0007 has not run in this database yet: run npm run db:migrate first.');
  // 1. Image jobs (provider jobs); a saved record of the same visual, below, wins.
  for (const row of (await db.prepare("SELECT * FROM image_jobs WHERE status<>'archived'").bind().all()).results) {
    let data; try { data = JSON.parse(row.data); } catch { counts.problems++; continue; }
    const v = data?.visual; if (!v?.id) continue;
    counts.jobs++;
    await put({...fromVisual(row.owner, {...v, status: row.status === 'ready' ? 'ready' : plainStatus(row.status) === 'failed' ? 'failed' : 'pending', jobStatus: row.status}), createdAt: Number(row.created_at) || Date.now()}, row.org_id);
  }
  // 2. Saved records in storage, with their deleted marks.
  const deleted = new Map();
  for await (const key of keys('orgs/')) { const m = /^(orgs\/[^/]+\/users\/[^/]+\/)deleted-visuals\/([^/]+)\.json$/.exec(key); if (m) deleted.set(m[2], Date.now()); }
  for await (const key of keys('orgs/')) {
    const m = /^(orgs\/[^/]+\/users\/[^/]+\/)visuals\/([^/]+)\.json$/.exec(key); if (!m) continue;
    let visual; try { visual = await (await store.get(key))?.json(); } catch { counts.problems++; continue; }
    if (!visual?.id) continue;
    counts.records++;
    await put({...fromVisual(m[1], visual), deletedAt: deleted.has(visual.id) ? deleted.get(visual.id) : null}, orgOf(m[1]));
  }
  // 3. Films, swaps and stories.
  for (const [table, from, n] of [['films', fromFilm, 'films'], ['swap_jobs', fromSwap, 'swaps'], ['storyboards', fromStory, 'stories']]) {
    for (const row of (await db.prepare(`SELECT * FROM ${table}`).bind().all()).results) { counts[n]++; await put(from(row), row.org_id); }
  }
  // Mark these companies as filled, so the Studio does not fill them again (after 0009).
  if (!dry) {
    try { for (const org of orgs) await db.prepare('INSERT INTO library_backfills(org_id,started_at,done_at) VALUES(?,?,?) ON CONFLICT(environment,org_id) DO UPDATE SET done_at=excluded.done_at').bind(org, Date.now(), Date.now()).run(); }
    catch (e) { if (!/library_backfills/i.test(e instanceof Error ? e.message : String(e))) throw e; console.info('Migration 0009 has not run: the companies are not marked as filled.'); }
  }
  console.log(JSON.stringify({environment: env, dry, ...counts}));
} finally { await sql.end({timeout: 5}); }
