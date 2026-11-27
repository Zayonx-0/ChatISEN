import assert from 'node:assert/strict';
import test from 'node:test';
import { markdown, summarize } from './synthese.mjs';

const point = (metric, value, plateau = 'palier_2', time = '2026-01-01T00:00:00Z') => JSON.stringify({
  type: 'Point', metric, data: { value, time, tags: { plateau, vus: '2', duration_s: '45' } },
});

test('synthèse k6 par palier, p95 interpolé et comptes des erreurs', async () => {
  const summary = await summarize([
    point('rest_ms', 10), point('rest_ms', 30, 'palier_2', '2026-01-01T00:00:01Z'),
    point('rest_errors', 1), point('rest_errors', 0),
    point('delivery_ms', 6, 'palier_1'), point('http_req_duration', 30),
    point('delivery_ms', 9, ''), '{"type":"Metric","metric":"rest_ms"}',
  ]);
  const report = markdown(summary);
  assert.match(report, /palier_1[^\n]+6\.0 \(n=1\)[\s\S]+palier_2/);
  assert.match(report, /00:00:00\.000Z \/ 2026-01-01T00:00:01\.000Z \| 29\.0 \(n=2\)/);
  assert.match(report, /50\.00 % \(1\/2\)/);
  assert.match(report, /non mesuré/);
});

test('une sortie vide reste non mesurée et les lignes corrompues sont signalées', async () => {
  assert.match(markdown(await summarize([])), /\| non mesuré \| non mesuré \|/);
  await assert.rejects(summarize(['', '{']), /ligne 2/);
  await assert.rejects(summarize([point('rest_errors', 2)]), /Point k6 invalide/);
});
