// Synthetic data for the gallery and the wireframes. Nothing here is a real
// company, person, car or price: credit figures are examples to show the
// layout, not the cost table (which stays on the server).
import type { Company } from '@/components/ds/shell';
import type { MediaItem } from '@/components/ds/media';
import type { Job } from '@/lib/ds/words';

export const LONG_NAME = 'Example Motors Group Middle East and North Africa Regional Marketing Department';

export const COMPANIES: Company[] = [
  { id: 'nm', name: 'Nmesis', kind: 'internal' },
  { id: 'c1', name: 'Demo Company', kind: 'client', plan: 'Growth' },
  { id: 'c2', name: 'Sample Auto', kind: 'client', plan: 'Starter' },
  { id: 'c3', name: LONG_NAME, kind: 'client', plan: 'Enterprise' },
  { id: 'c4', name: 'Test Dealers', kind: 'client', plan: 'Growth' },
  { id: 'c5', name: 'Placeholder Cars', kind: 'client', plan: 'Starter' },
  { id: 'c6', name: 'Example Fleet', kind: 'client', plan: 'Growth' },
  { id: 'c7', name: 'Demo Imports', kind: 'client', plan: 'Enterprise' },
  { id: 'c8', name: 'Sample Motors North', kind: 'client', plan: 'Growth' },
  { id: 'c9', name: 'Sample Motors South', kind: 'client', plan: 'Starter' },
];

export type ToolTile = { id: string; name: string; line: string; credits: number; plan: 'Starter' | 'Growth' | 'Enterprise' };
export const TOOLS: ToolTile[] = [
  { id: 'kv', name: 'Key visual', line: 'One car, one scene, campaign-ready.', credits: 4, plan: 'Starter' },
  { id: 'lineup', name: 'Line-up', line: 'Several cars together in one frame.', credits: 6, plan: 'Growth' },
  { id: 'area', name: 'Area edit', line: 'Paint over a part and say what changes.', credits: 3, plan: 'Growth' },
  { id: 'film', name: 'Film', line: 'A short film from your frames.', credits: 120, plan: 'Enterprise' },
  { id: 'swap', name: 'Car swap', line: 'Put your car into an existing shot.', credits: 40, plan: 'Enterprise' },
  { id: 'story', name: 'Storyboard', line: 'Plan a film frame by frame.', credits: 12, plan: 'Enterprise' },
  { id: 'upscale', name: 'Upscale', line: 'Make a finished visual larger and sharper.', credits: 8, plan: 'Growth' },
  { id: 'smart', name: 'Smart reference', line: 'Match the look of a picture you like.', credits: 2, plan: 'Growth' },
];

export const CARS = ['Demo SUV', 'Demo Saloon', 'Demo Hatch', 'Demo Pickup', 'Demo Coupé', 'Demo Crossover'];
export const PEOPLE = ['Alex Example', 'Sam Sample', 'Jordan Test', 'Robin Placeholder'];

const STATUS: MediaItem['status'][] = [undefined, undefined, undefined, { kind: 'info', label: 'In progress' }, undefined, { kind: 'bad', label: 'Failed' }];
export function library(n: number): MediaItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i + 1}`,
    name: i === 2 ? `${LONG_NAME} launch visual, desert at dusk` : `${CARS[i % CARS.length]} · ${['Desert dusk', 'City night', 'Studio white', 'Coast road', 'Mountain pass'][i % 5]}`,
    sub: ['Today', 'Yesterday', '12 Nov', '3 Nov'][i % 4],
    kind: (['image', 'image', 'film', 'image', 'swap', 'storyboard'] as const)[i % 6],
    status: STATUS[i % STATUS.length],
  }));
}

export const FOLDERS = [
  { id: 'f1', name: 'Launch campaign', count: 48, sub: [{ id: 'f1a', name: 'Social cut-downs', count: 12 }] },
  { id: 'f2', name: 'Showroom screens', count: 31, sub: [] },
  { id: 'f3', name: LONG_NAME, count: 1204, sub: [] },
  { id: 'f4', name: 'Unsorted', count: 217, sub: [] },
];

export const JOBS: Job[] = [
  { title: 'Key visual · Demo SUV', state: 'queued', position: 2, etaSeconds: 40, credits: 4, cancellable: true },
  { title: 'Film · Launch teaser', state: 'running', stage: 'Rendering frames', progress: 0.62, etaSeconds: 150, credits: 120, cancellable: true },
  { title: 'Upscale · Demo Saloon', state: 'running', stage: 'Sharpening', credits: 8, cancellable: false },
  { title: 'Car swap · Coast road', state: 'done', charged: 40 },
  { title: 'Line-up · Four cars', state: 'failed', error: 'The provider could not read the reference picture. Try a JPEG or PNG under 20 MB.', charged: 0 },
  { title: 'Storyboard · Night drive', state: 'cancelled', charged: 0 },
];
