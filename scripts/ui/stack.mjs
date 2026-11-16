// The Studio as the UI harness runs it: the production build (`next start`)
// against a disposable Postgres (TEST_DATABASE_URL, CI's service), a mocked
// Supabase Auth (scripts/verify/auth-mock.mjs) and an in-memory S3 stand-in
// (scripts/verify/s3-standin.mjs). The server process may not reach the
// network at all (./no-network.mjs); no provider key is set.
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startAuthMock } from '../verify/auth-mock.mjs';
import { startS3 } from '../verify/s3-standin.mjs';
import { prepareDatabase, seedAccounts, SEED_CARS } from './seed.mjs';
import { startConfiguratorStandin } from './configurator-standin.mjs';

const GUARD = fileURLToPath(new URL('./no-network.mjs', import.meta.url));
// Provider and email settings a developer may have locally: never passed on.
const DROP = /^(OPENAI_|GOOGLE_AI_|HIGGSFIELD_|TOPAZ_|EMAIL_|NMESIS_ALERT|SUPABASE_|S3_|DATABASE_URL|KEY_ENCRYPTION|STUDIO_PUBLIC_ORIGIN|VERCEL)/;

export async function startStack({ adminUrl, port = 3940, log = () => {} }) {
  if (!adminUrl) throw new Error('Set TEST_DATABASE_URL to a disposable Postgres (superuser), as CI does.');
  const s3 = await startS3();
  const auth = await startAuthMock();
  // The configurator site's settings and pictures (car pictures and brand logos), on this machine.
  const configurator = await startConfiguratorStandin(SEED_CARS.map(([b, m]) => [b, m]));
  const appUrl = await prepareDatabase(adminUrl, { log });
  await seedAccounts(adminUrl, auth);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !DROP.test(k)));
  Object.assign(env, {
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `${env.NODE_OPTIONS || ''} --import=${pathToFileURL(GUARD).href}`.trim(),
    VERCEL_ENV: 'preview',
    DATABASE_URL: appUrl,
    SUPABASE_URL: auth.url, SUPABASE_PUBLISHABLE_KEY: 'mock-publishable-key', SUPABASE_SECRET_KEY: 'mock-secret-key', STUDIO_GOOGLE_SIGNIN: 'off',
    S3_REGION: 'eu-central-1', S3_BUCKET: 'studio-ui', S3_ENDPOINT: s3.url, S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'local', S3_SECRET_ACCESS_KEY: 'local-secret',
    KEY_ENCRYPTION_SECRET: '5e'.repeat(32),
    CONFIGURATOR_ORIGIN: 'https://configurator.example.test',
    CONFIGURATOR_API_ORIGIN: configurator.origin,
  });
  const origin = `http://localhost:${port}`;
  const startedAt = Date.now();
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  const blocked = new Map();
  const take = (d) => {
    for (const line of String(d).split('\n')) {
      if (!line.trim()) continue;
      output.push(line);
      const m = /\[no-network\] blocked (\S+)/.exec(line);
      if (m) blocked.set(m[1], (blocked.get(m[1]) || 0) + 1);
    }
    if (output.length > 5000) output.splice(0, output.length - 5000);
  };
  server.stdout.on('data', take); server.stderr.on('data', take);
  let ready = 0;
  for (let i = 0; ; i++) {
    try { if ((await fetch(origin + '/signin')).ok) { ready = Date.now() - startedAt; break; } } catch { /* not listening yet */ }
    if (i > 240 || server.exitCode !== null) throw new Error('The Studio did not start:\n' + output.slice(-40).join('\n'));
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    origin, s3, auth, appUrl, adminUrl, output, blocked, readyMs: ready, env,
    stop: async () => { server.kill(); auth.server.close(); s3.server.close(); configurator.server.close(); },
  };
}
