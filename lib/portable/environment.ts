// Which Studio environment this server is: Production and Preview share one
// Supabase project, so every row of client work carries its environment and the
// database shows a request only its own (migration 0004_environment.sql).
//
// From Vercel's own VERCEL_ENV (production | preview | development). Without it,
// a development server (next dev, the tests) is 'development'. A production
// server without VERCEL_ENV refuses to guess: reading Production's rows as
// 'development' (or the other way round) is exactly the leak this prevents.
export const ENVIRONMENTS = ['production', 'preview', 'development'] as const;
export type StudioEnvironment = typeof ENVIRONMENTS[number];

export class EnvironmentError extends Error {}

export function studioEnvironment(env: Record<string, string | undefined> = process.env): StudioEnvironment {
  const v = (env.VERCEL_ENV || '').trim();
  if ((ENVIRONMENTS as readonly string[]).includes(v)) return v as StudioEnvironment;
  if (v) throw new EnvironmentError(`VERCEL_ENV is "${v}"; the Studio knows production, preview and development.`);
  if (env.NODE_ENV !== 'production') return 'development';
  throw new EnvironmentError('VERCEL_ENV is not set on a production server, so the Studio cannot tell Production from Preview. Turn on Vercel\'s system environment variables.');
}
