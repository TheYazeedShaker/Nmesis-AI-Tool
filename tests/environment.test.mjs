// Production and Preview share the database: the server knows which one it is
// (lib/portable/environment.ts), and the adapter tells Postgres on every
// statement (lib/portable/database.ts), next to the user. The Postgres side
// (row level security, migration 0004) is tested in tests/postgres.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../scripts/verify/hooks.mjs', import.meta.url);
const { studioEnvironment, EnvironmentError } = await import('../lib/portable/environment.ts');
const { StudioDatabase } = await import('../lib/portable/database.ts');

test('the environment comes from VERCEL_ENV; development locally; a production server never guesses', () => {
  assert.equal(studioEnvironment({ VERCEL_ENV: 'production', NODE_ENV: 'production' }), 'production');
  assert.equal(studioEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), 'preview');
  assert.equal(studioEnvironment({ VERCEL_ENV: 'development' }), 'development');
  assert.equal(studioEnvironment({}), 'development', 'next dev and the tests');
  assert.equal(studioEnvironment({ NODE_ENV: 'development' }), 'development');
  assert.throws(() => studioEnvironment({ NODE_ENV: 'production' }), EnvironmentError, 'no VERCEL_ENV on a production server');
  assert.throws(() => studioEnvironment({ VERCEL_ENV: 'staging' }), EnvironmentError, 'an unknown name');
});

// A stand-in for the postgres client that records what is sent.
function recorder() {
  const sent = [];
  const tag = (strings, ...values) => { sent.push({ text: strings.join('$'), values }); return Promise.resolve([]); };
  const tx = Object.assign(tag, { unsafe: (text, args) => { sent.push({ text, values: args }); return Promise.resolve(Object.assign([], { count: 0 })); } });
  const sql = { sent, unsafe: tx.unsafe, begin: async (fn) => { const r = fn(tx); return Array.isArray(r) ? Promise.all(r) : r; } };
  return sql;
}

test('every statement for a signed-in person sets the person and the environment together', async () => {
  const sql = recorder();
  const db = new StudioDatabase(sql, null, 'preview').forUser('00000000-0000-4000-8000-0000000000a1');
  assert.equal(db.environment, 'preview', 'forUser keeps the environment');
  // Plain values: the settings and the statement in one message (one round trip).
  await db.prepare('SELECT id FROM films WHERE id=?').bind('f1').all();
  assert.equal(sql.sent.length, 1);
  assert.equal(sql.sent[0].text, "SET LOCAL studio.user_id = '00000000-0000-4000-8000-0000000000a1'; SET LOCAL studio.env = 'preview'; SELECT id FROM films WHERE id= 'f1' ");
  assert.equal(sql.sent[0].values, undefined, 'no parameters left');
  // A value with a quote stays a parameter: the settings and the statement in one transaction, as before.
  sql.sent.length = 0;
  await db.prepare('SELECT id FROM films WHERE title=?').bind("Owner's cut").all();
  const [setting, statement] = sql.sent;
  assert.match(setting.text, /set_config\('studio\.user_id', \$, true\), set_config\('studio\.env', \$, true\)/);
  assert.deepEqual(setting.values, ['00000000-0000-4000-8000-0000000000a1', 'preview']);
  assert.equal(statement.text, 'SELECT id FROM films WHERE title=$1');
  assert.deepEqual(statement.values, ["Owner's cut"]);
  sql.sent.length = 0;
  await db.batch([db.prepare('UPDATE films SET status=? WHERE id=?').bind('done', 'f1')]);
  assert.equal(sql.sent[0].text, "SET LOCAL studio.user_id = '00000000-0000-4000-8000-0000000000a1'; SET LOCAL studio.env = 'preview'; ", 'batches too');
  assert.equal(sql.sent[1].text, "UPDATE films SET status= 'done'  WHERE id= 'f1' ");
});

test('the environment is set in the database layer, not by routes', () => {
  // No route or library module names the column or the setting: the policies
  // and the column default do the work.
  const offenders = [];
  for (const file of ['lib/credits/store.ts', 'lib/film-server.ts', 'lib/swap-server.ts', 'lib/image-server.ts', 'lib/topaz-server.ts', 'lib/storyboard-server.ts']) {
    // (Prompts may say "environment" about a scene; SQL may not name the column.)
    if (/(WHERE|AND|SET|,|\()\s*environment\s*(=|,|\))|studio\.env/i.test(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  const migration = readFileSync(new URL('../supabase/migrations/0004_environment.sql', import.meta.url), 'utf8');
  assert.match(migration, /set default studio\.request_env\(\)/, 'new rows take the request\'s environment');
  for (const table of ['films', 'swap_jobs', 'storyboards', 'image_jobs', 'topaz_jobs', 'film_budgets', 'credit_holds', 'staff_access_log']) {
    assert.match(migration, new RegExp(`alter table studio\\.${table} add column if not exists environment text not null default 'production';`), `${table}: existing rows are Production's`);
  }
});
