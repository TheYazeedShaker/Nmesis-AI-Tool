// The car view on /key-visual (and every tool with a live configurator) showed a
// broken page (the browser's torn-page icon) above "Use this view": the frame
// loaded the placeholder configurator, whose address does not exist, while the
// company's cars were loading and whenever none came back. The browser still
// fires `load` for its own error page, so the 10 s check never caught it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_CONFIGURATOR, carConfigurators, liveConfiguratorUrl } from '../lib/configurators.ts';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

test('the placeholder configurator is never an address a frame may load', () => {
  assert.equal(liveConfiguratorUrl(DEMO_CONFIGURATOR), null);
  assert.equal(liveConfiguratorUrl({ url: DEMO_CONFIGURATOR.url }), null, 'by address too, as the frame only knows its url');
  assert.equal(liveConfiguratorUrl({ id: 'demo', url: 'https://configurator.example.test/demo/suv/' }), null);
  for (const url of ['', 'http://configurator.example.test/demo/suv/', 'javascript:alert(1)', 'https://user:pw@configurator.example.test/x/', 'not a link']) assert.equal(liveConfiguratorUrl({ id: 'demo.suv', url }), null, url);
  assert.equal(liveConfiguratorUrl({ id: 'demo.suv', url: 'https://configurator.example.test/demo/suv/' }), 'https://configurator.example.test/demo/suv/');
  assert.equal(liveConfiguratorUrl(null), null);
});

test('a car left out of the list is said in the log, counts only, never an address', () => {
  const warned = [];
  const warn = (message, detail) => warned.push([message, detail]);
  const cars = [
    { brandId: 'demo', modelId: 'suv', brandName: 'Demo', modelName: 'SUV', path: '/demo/suv/', template: 'capture' },
    { brandId: 'demo', modelId: 'hatch', brandName: 'Demo', modelName: 'Hatch', path: 'https://configurator.example.test/demo/hatch/', template: 'capture' },
    { brandId: 'demo', modelId: 'json', brandName: 'Demo', modelName: 'Json', path: 'https://configurator.example.test/demo/config.json', template: 'capture' },
  ];
  // No CONFIGURATOR_ORIGIN: the path cannot become a link; the absolute one still works.
  const out = carConfigurators(cars, undefined, warn);
  assert.deepEqual(out.map((c) => c.id), ['demo.hatch']);
  assert.deepEqual(warned.map(([, d]) => d), [{ cars: 1 }, { cars: 1 }]);
  assert.match(warned[0][0], /CONFIGURATOR_ORIGIN is not set/);
  assert.ok(!JSON.stringify(warned).includes('example.test'), 'no address in the log');
  // With the origin, the path is joined and nothing about it is said.
  warned.length = 0;
  assert.deepEqual(carConfigurators(cars, 'https://configurator.example.test', warn).map((c) => c.url), ['https://configurator.example.test/demo/suv/', 'https://configurator.example.test/demo/hatch/']);
  assert.equal(warned.length, 1);
});

test('the live frame draws a state, never an iframe, for the placeholder', () => {
  const answered = { value: false };
  const load = tsxLoader({ '@/lib/configurator-presets': { useConfiguratorsAnswered: () => answered.value } });
  const { LiveFrame } = load('components/editor/live-frame.tsx');
  const draw = (url) => renderToStaticMarkup(React.createElement(LiveFrame, { url, name: 'Demo SUV' }));
  const loading = draw(DEMO_CONFIGURATOR.url);
  assert.match(loading, /Loading your cars/);
  assert.doesNotMatch(loading, /<iframe/);
  answered.value = true;
  const none = draw(DEMO_CONFIGURATOR.url);
  assert.match(none, /No car to show here yet/);
  assert.doesNotMatch(none, /<iframe|configurator\.example\.com/);
  // A real car: no state (the frame itself is created after mount, in the browser).
  assert.doesNotMatch(draw('https://configurator.example.test/demo/suv/'), /Loading your cars|No car to show/);
});

test('every tool reaches the configurator frame through LiveFrame, never a raw iframe', () => {
  for (const file of ['app/key-visual/page.tsx', 'app/swap/page.tsx', 'components/editor/lineup-capture.tsx', 'components/editor/storyboard-car.tsx']) {
    const src = read(file);
    assert.match(src, /<LiveFrame /, file);
    assert.doesNotMatch(src, /<iframe/, file);
  }
  assert.match(read('components/editor/live-frame.tsx'), /const address = liveConfiguratorUrl\(\{url\}\);[\s\S]*if \(!address\) return <NoCar/);
});
