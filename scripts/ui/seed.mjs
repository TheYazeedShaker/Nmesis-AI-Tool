// The UI harness's synthetic world, on a disposable Postgres (CI's service) and
// the in-memory S3 stand-in. Nothing here is a real company, person, car or
// price. It builds what the owner's brief asks the audit to see:
//  - five companies: Nmesis (internal), a Growth company at 85% of its credits,
//    a Starter company at 100% with tools locked, an Enterprise company with a
//    very long name and huge numbers, and a company whose subscription ended;
//  - every role (owner, creator, viewer), a person in two companies, a person in
//    none, Nmesis staff (the six-digit code already passed) with a client's
//    support-access grant, and a client without one;
//  - 300 visuals in one library (some failed, some in progress, some in the
//    trash), films, swaps and storyboards, long names, zero and huge numbers.
// Folders and projects do not exist yet (Phase 3); the audit notes them as missing.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { encode } from 'fast-png';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
export const PASSWORD = 'harness-password-0123456789';
const DB_PASSWORD = 'harness-db-password-0123456789';
const asRole = (url, user, password) => { const u = new URL(url); u.username = user; u.password = password; return u.href; };
const ssl = (url) => (/[?&]sslmode=disable\b/.test(url) ? false : 'require');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Phase 3: the folders seeded for Demo Company (one with a sub-folder, one long name, one empty).
export const FOLDER_ID = '00000000-0000-4000-8000-0000000f0001';
export const ENV = 'preview'; // the harness's Studio runs with VERCEL_ENV=preview

export const ORGS = {
  nmesis: { id: uuid(100), name: 'Nmesis', kind: 'internal' },
  growth: { id: uuid(101), name: 'Demo Company', kind: 'client', plan: 'growth' },
  starter: { id: uuid(102), name: 'Sample Auto', kind: 'client', plan: 'starter' },
  enterprise: { id: uuid(103), name: 'Example Motors Group Middle East and North Africa Regional Marketing Department', kind: 'client', plan: 'enterprise' },
  ended: { id: uuid(104), name: 'Ended Motors Demo', kind: 'client', plan: 'growth', ended: true },
  // Phase 3 group 2: the library at scale (1,000 pieces of work), checked only by --perf.
  scale: { id: uuid(105), name: 'Scale Test Motors', kind: 'client', plan: 'growth' },
};

// Who signs in. `role` is the audit's name for them.
export const PEOPLE = {
  owner: { id: uuid(1), email: 'owner@demo.example.test', name: 'Alex Example', memberships: [['growth', 'owner'], ['enterprise', 'viewer']] },
  creator: { id: uuid(2), email: 'creator@demo.example.test', name: 'Sam Sample', memberships: [['growth', 'creator']] },
  viewer: { id: uuid(3), email: 'viewer@demo.example.test', name: 'Jordan Test', memberships: [['growth', 'viewer']] },
  starter: { id: uuid(4), email: 'owner@starter.example.test', name: 'Robin Placeholder', memberships: [['starter', 'owner']] },
  enterprise: { id: uuid(5), email: 'owner@enterprise.example.test', name: 'Casey Longname-Example-Hyphenated-Surname', memberships: [['enterprise', 'owner']] },
  ended: { id: uuid(6), email: 'owner@ended.example.test', name: 'Morgan Demo', memberships: [['ended', 'owner']] },
  nocompany: { id: uuid(7), email: 'nobody@example.test', name: 'Riley Nobody', memberships: [] },
  staff: { id: uuid(8), email: 'staff@nmesis.example.test', name: 'Staff Example', memberships: [], staff: true },
  scale: { id: uuid(9), email: 'owner@scale.example.test', name: 'Taylor Scale', memberships: [['scale', 'owner']] },
};
export const SCALE_ITEMS = 1000;

const PLAN_FEATURES = {
  starter: { 'studio.enabled': true, 'studio.key_visuals': true, 'studio.credits_monthly': 500, 'studio.max_output': '2k' },
  growth: {
    'studio.enabled': true, 'studio.key_visuals': true, 'studio.lineups': true, 'studio.area_edit': true, 'studio.object_select': true,
    'studio.pinterest': true, 'studio.smart_reference': true, 'studio.upscale': true, 'studio.credits_monthly': 2000, 'studio.max_output': '4k',
  },
  enterprise: {
    'studio.enabled': true, 'studio.key_visuals': true, 'studio.lineups': true, 'studio.area_edit': true, 'studio.object_select': true,
    'studio.pinterest': true, 'studio.smart_reference': true, 'studio.upscale': true, 'studio.film': true, 'studio.swap': true,
    'studio.storyboards': true, 'studio.own_keys': true, 'studio.credits_monthly': 10000000, 'studio.max_output': null,
  },
};

// The admin's entitlements, for the plans above (the shared fixture answers
// "legacy" for everyone). Subscriptions here also carry an end date.
const ENTITLEMENTS_SQL = `
alter table accounts.subscriptions add column if not exists ends_on date;
create or replace function accounts.entitlements(org uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select case when s.id is null then
      jsonb_build_object('org', o.id, 'org_name', o.name, 'managed', false, 'legacy', true, 'status', null, 'plan_id', null, 'plan_name', null, 'features', '{}'::jsonb)
    else
      jsonb_build_object('org', o.id, 'org_name', o.name, 'managed', true, 'legacy', false, 'status', s.status, 'plan_id', s.plan_id,
        'plan_name', initcap(s.plan_id), 'ends_on', s.ends_on,
        'features', coalesce((select jsonb_object_agg(pf.feature_key, pf.value) from accounts.plan_features pf where pf.plan_id = s.plan_id), '{}'::jsonb))
    end
    from accounts.organisations o
    left join lateral (select * from accounts.subscriptions x where x.org_id = o.id order by x.created_at desc limit 1) s on true
   where o.id = org;
$fn$;`;

/** A clean `studio` schema and role, the accounts fixture, the owner's setup SQL and every migration. */
export async function prepareDatabase(adminUrl, { log = () => {} } = {}) {
  const admin = postgres(adminUrl, { max: 1, prepare: false, ssl: ssl(adminUrl), onnotice: () => {} });
  try {
    await admin.unsafe(`drop schema if exists studio cascade; drop schema if exists accounts cascade;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if exists (select 1 from pg_roles where rolname='studio_app') then execute 'drop owned by studio_app'; execute 'drop role studio_app'; end if;
      end $$;
      drop table if exists auth.users;`);
    await admin.unsafe(read('tests/fixtures/accounts-schema.sql'));
    await admin.unsafe(read('docs/supabase-setup.sql').replaceAll('REPLACE_WITH_A_LONG_RANDOM_PASSWORD', DB_PASSWORD));
    await admin.unsafe(ENTITLEMENTS_SQL);
  } finally { await admin.end({ timeout: 5 }); }
  const appUrl = asRole(adminUrl, 'studio_app', DB_PASSWORD);
  const { migrate } = await import('../migrate.mjs');
  await migrate(appUrl, { log });
  return appUrl;
}

/** Companies, people, plans, credits, cars and the support grant. Adds the people to the auth mock. */
export async function seedAccounts(adminUrl, auth) {
  const admin = postgres(adminUrl, { max: 1, prepare: false, ssl: ssl(adminUrl), onnotice: () => {} });
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  try {
    for (const p of Object.values(PEOPLE)) {
      await admin`insert into auth.users(id,email,raw_user_meta_data) values (${p.id}, ${p.email}, ${admin.json({ full_name: p.name })})`;
      auth.addUser(p.email, PASSWORD, { nmesis_password_set: true }, { id: p.id, aal: p.staff ? 'aal2' : 'aal1' });
    }
    for (const o of Object.values(ORGS)) {
      await admin`insert into accounts.organisations(id,name,kind,status) values (${o.id}, ${o.name}, ${o.kind}, ${o.ended ? 'ended' : 'active'})`;
    }
    for (const p of Object.values(PEOPLE)) {
      for (const [org, role] of p.memberships) {
        await admin`insert into accounts.members(org_id,user_id,role,status,joined_at) values (${ORGS[org].id}, ${p.id}, ${role}, 'active', now())`;
      }
      if (p.staff) await admin`insert into accounts.staff(user_id,name,role,active) values (${p.id}, ${p.name}, 'ops', true)`;
    }
    for (const [plan, features] of Object.entries(PLAN_FEATURES)) {
      for (const [key, value] of Object.entries(features)) {
        await admin`insert into accounts.plan_features(plan_id,feature_key,value) values (${plan}, ${key}, ${value === null ? null : admin.json(value)})`;
      }
    }
    for (const o of Object.values(ORGS).filter((x) => x.plan)) {
      await admin`insert into accounts.subscriptions(org_id,plan_id,status,starts_on,ends_on) values (${o.id}, ${o.plan}, ${o.ended ? 'ended' : 'active'}, ${daysAgo(10)}, ${o.ended ? daysAgo(5) : null})`;
    }
    // Credits used this period: Growth 85% (1,700 of 2,000), Starter 100%
    // (500 of 500), Enterprise none of 10,000,000 plus a 1,250,000 pack.
    const tools = ['studio.key_visuals', 'studio.lineups', 'studio.area_edit', 'studio.upscale'];
    const used = async (org, people, total, step) => {
      for (let i = 0, left = total; left > 0; i++, left -= step) {
        const credits = Math.min(step, left);
        await admin`insert into accounts.usage_ledger(org_id,product_key,feature_key,actor,quantity,unit,credits,provider,provider_cost_usd,ref,details,at)
          values (${org}, 'studio', ${tools[i % tools.length]}, ${people[i % people.length]}, 1, 'action', ${-credits}, 'openai', 0, ${`seed-${org}-${i}`},
                  ${admin.json({ action: ['Key visual', 'Line-up', 'Area edit', 'Upscale'][i % 4] })}, now() - ${`${i * 7} minutes`}::interval)`;
      }
    };
    await used(ORGS.growth.id, [PEOPLE.owner.id, PEOPLE.creator.id], 1700, 50);
    await used(ORGS.starter.id, [PEOPLE.starter.id], 500, 25);
    await admin`insert into accounts.credit_packs(org_id,credits,price,bought_on,expires_on) values (${ORGS.enterprise.id}, 1250000, 0, ${daysAgo(3)}, ${daysAgo(-365)})`;
    // Cars from the master list, through the companies' brands.
    const cars = [['demo', 'suv', 'Demo', 'SUV'], ['demo', 'saloon', 'Demo', 'Saloon'], ['demo', 'hatch', 'Demo', 'Hatch'], ['sample', 'pickup', 'Sample', 'Pickup'], ['sample', 'coupe', 'Sample', 'Coupé with a very long trim name for clipping checks']];
    for (const [brand, model, brandName, modelName] of cars) {
      await admin`insert into accounts.cars(brand_id,model_id,brand_name,model_name,configurator_url,live) values (${brand}, ${model}, ${brandName}, ${modelName}, ${`/${brand}/${model}/`}, true)`;
    }
    for (const org of [ORGS.growth.id, ORGS.starter.id, ORGS.enterprise.id, ORGS.ended.id]) {
      await admin`insert into accounts.organisation_brands(org_id,brand_id) values (${org}, 'demo')`;
    }
    await admin`insert into accounts.organisation_brands(org_id,brand_id) values (${ORGS.enterprise.id}, 'sample')`;
    // Growth has granted Nmesis support access for 7 days; Starter has not.
    await admin`insert into studio.support_grants(org_id,granted_by,granted_at,until,note) values (${ORGS.growth.id}, ${PEOPLE.owner.id}, ${Date.now()}, ${Date.now() + 7 * 86_400_000}, 'Please look at the line-up')`;
    void today;
  } finally { await admin.end({ timeout: 5 }); }
}

// ── The library: S3 objects plus job rows ───────────────────────────────────
const prefixOf = (org, person) => `orgs/${ORGS[org].id}/users/${PEOPLE[person].id}/`;
function png(i, w = 64, h = 36) {
  const data = new Uint8Array(w * h * 4);
  const hue = (i * 47) % 255;
  for (let p = 0; p < w * h; p++) { data[p * 4] = hue; data[p * 4 + 1] = (p % w) * 3; data[p * 4 + 2] = 255 - hue; data[p * 4 + 3] = 255; }
  return Buffer.from(encode({ width: w, height: h, data, channels: 4 }));
}
function put(s3, key, body, type) {
  s3.objects.set(key, { body, etag: createHash('md5').update(body).digest('hex'), type, meta: {}, at: new Date() });
}
const SCENES = ['Desert dusk', 'City night', 'Studio white', 'Coast road', 'Mountain pass', 'Rainy street', 'Forest track', 'Harbour at dawn'];
const VEHICLES = ['Demo SUV', 'Demo Saloon', 'Demo Hatch'];

/** n visuals for one person: ready, a few failed, a few in progress, a few in the trash. Returns their ids. */
// `spread`: in-progress work keeps its place in time (a real library at scale)
// instead of being the newest (the audit's 300, where it is checked first).
export function seedVisuals(s3, org, person, n, start = 0, { spread = false } = {}) {
  const prefix = prefixOf(org, person), ids = [];
  for (let k = 0; k < n; k++) {
    const i = start + k, id = uuid(10_000 + i);
    const failed = i % 29 === 7, pending = spread ? i % 211 === 11 : i % 31 === 11;
    const created = new Date(Date.now() - (pending && !spread ? 30_000 : (spread ? k : i) * 3_600_000));
    const title = i === 3 ? `${ORGS.enterprise.name} launch visual for the regional autumn campaign, desert at dusk, wide` : `${VEHICLES[i % 3]} · ${SCENES[i % SCENES.length]}`;
    const visual = {
      id, title, src: '/api/assets/' + id, status: failed ? 'failed' : pending ? 'pending' : 'ready', createdAt: created.toISOString(),
      prompt: `${VEHICLES[i % 3]} in a ${SCENES[i % SCENES.length].toLowerCase()} scene, campaign key visual.`, provider: 'openai', model: 'gpt-image',
      vehicle: VEHICLES[i % 3], width: 1536, height: 864, size: '1536x864',
      ...(failed ? { error: 'The provider could not finish this image. Nothing was charged.' } : {}),
    };
    put(s3, prefix + 'visuals/' + id + '.json', Buffer.from(JSON.stringify(visual)), 'application/json');
    if (!failed && !pending) put(s3, prefix + 'images/' + id, png(i), 'image/png');
    if (i % 60 === 5) put(s3, prefix + 'deleted-visuals/' + id + '.json', Buffer.from(JSON.stringify({ id, deletedAt: new Date().toISOString() })), 'application/json');
    ids.push(id);
  }
  return ids;
}

/** Studio content: 300 visuals for Growth, and films, swaps and storyboards for Enterprise (through the Studio's own routes). */
export async function seedStudio({ s3, adminUrl, request }) {
  const growthIds = seedVisuals(s3, 'growth', 'owner', 200, 0);
  seedVisuals(s3, 'growth', 'creator', 100, 200);
  const entIds = seedVisuals(s3, 'enterprise', 'enterprise', 12, 400).filter((_, i) => i % 29 !== 7 && i % 31 !== 11);
  seedVisuals(s3, 'starter', 'starter', 3, 500);
  seedVisuals(s3, 'ended', 'ended', 6, 600);
  seedVisuals(s3, 'scale', 'scale', SCALE_ITEMS, 1000, { spread: true });
  const api = request.enterprise;
  const ok = async (r, what) => { if (!r.ok()) throw new Error(`${what} -> ${r.status()} ${await r.text()}`); return r.json(); };
  // Films: drafts through the route, then other states as the provider would leave them.
  const films = [];
  for (const [title, i] of [['Launch teaser', 0], ['Showroom loop', 1], ['Night drive', 2], ['Coast road cut-down', 3]]) {
    films.push((await ok(await api.post('/api/films', { data: { sourceId: entIds[i], title, vehicle: 'Demo SUV' } }), 'create film')).film.id);
  }
  // A swap: a reference ad (stand-in bytes) and two car views.
  const sourceId = uuid(90_001);
  put(s3, prefixOf('enterprise', 'enterprise') + 'swap-sources/' + sourceId + '.mp4', Buffer.from('not really a video'), 'video/mp4');
  const swap = await ok(await api.post('/api/swaps', { data: { title: 'Coast road swap', vehicle: 'Demo SUV', configurator: 'https://configurator.example.test/demo/suv/', sourceId, sourceDuration: 8, imageIds: entIds.slice(0, 2), resolution: '720p' } }), 'create swap');
  for (const title of ['Night drive story', 'Showroom story', '']) {
    await ok(await api.post('/api/storyboards', { data: { title, vehicle: 'Demo SUV', configurator: 'https://configurator.example.test/demo/suv/', views: [], idea: 'A calm night drive along the coast.', direction: '', moodId: '', pin: '', shots: [], brand: '', tagline: '' } }), 'create storyboard');
  }
  const admin = postgres(adminUrl, { max: 1, prepare: false, ssl: ssl(adminUrl), onnotice: () => {} });
  try {
    await admin`update studio.films set status='queued', credits=120, updated_at=${Date.now()} where id=${films[1]}`;
    await admin`update studio.films set status='failed', error='Higgsfield could not read the source frame. Nothing was charged.', updated_at=${Date.now()} where id=${films[2]}`;
    await admin`update studio.films set status='quoted', credits=120, estimate=600000 where id=${films[3]}`;
    await admin`update studio.swap_jobs set status='failed', error='The reference ad could not be read. Nothing was charged.' where id=${swap.swap.id}`;
    // In-progress and failed image jobs (Higgsfield), as the library shows them.
    for (const [n, status, error] of [[1, 'queued', null], [2, 'in_progress', null], [3, 'failed', 'Higgsfield stopped before it finished. Nothing was charged.']]) {
      const id = uuid(80_000 + n), owner = prefixOf('growth', 'owner');
      const data = { visual: { id, title: `Demo SUV · 0${n}`, src: '/api/assets/' + id, status: status === 'failed' ? 'failed' : 'pending', createdAt: new Date().toISOString(), provider: 'higgsfield', model: 'marketing-studio/image/sunburst', vehicle: 'Demo SUV' } };
      await admin.begin(async (tx) => {
        await tx`select set_config('studio.env', ${ENV}, true)`;
        await tx`insert into studio.image_jobs(id,org_id,owner,payer,status,data,created_at,updated_at,error) values (${id}, ${ORGS.growth.id}, ${owner}, ${owner}, ${status}, ${JSON.stringify(data)}, ${Date.now()}, ${Date.now()}, ${error})`;
      });
    }
    // One job row the Studio can no longer read (a model it does not know): the
    // library must skip it and show the rest (F-065).
    {
      const id = uuid(80_009), owner = prefixOf('growth', 'creator');
      const data = { visual: { id, title: 'Unreadable job', src: '/api/assets/' + id, status: 'pending', createdAt: new Date().toISOString(), provider: 'higgsfield', model: 'a-model-that-was-retired', vehicle: 'Demo SUV' } };
      await admin.begin(async (tx) => {
        await tx`select set_config('studio.env', ${ENV}, true)`;
        await tx`insert into studio.image_jobs(id,org_id,owner,payer,status,data,created_at,updated_at) values (${id}, ${ORGS.growth.id}, ${owner}, ${owner}, 'queued', ${JSON.stringify(data)}, ${Date.now()}, ${Date.now()})`;
      });
    }
    // Folders (0006): Launch campaign (with Social cut-downs), a long name, an empty one; work in them.
    const folderOwner = prefixOf('growth', 'owner'), now = Date.now();
    const folders = [[FOLDER_ID, null, 'Launch campaign'], ['00000000-0000-4000-8000-0000000f0002', FOLDER_ID, 'Social cut-downs'], ['00000000-0000-4000-8000-0000000f0003', null, ORGS.enterprise.name + ' showroom screens'], ['00000000-0000-4000-8000-0000000f0004', null, 'Winter offers']];
    await admin.begin(async (tx) => {
      await tx`select set_config('studio.env', ${ENV}, true)`;
      for (const [id, parent, name] of folders) await tx`insert into studio.folders(id,org_id,parent_id,name,created_by,created_at,updated_at) values (${id}, ${ORGS.growth.id}, ${parent}, ${name}, ${folderOwner}, ${now}, ${now})`;
      for (const [i, id] of growthIds.slice(0, 30).entries()) await tx`insert into studio.folder_items(org_id,item_kind,item_id,folder_id,updated_at) values (${ORGS.growth.id}, 'visual', ${id}, ${folders[i < 18 ? 0 : i < 24 ? 1 : 2][0]}, ${now})`;
    });
  } finally { await admin.end({ timeout: 5 }); }
}
