import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const trends = ['rest_ms', 'ws_ms', 'delivery_ms'];
const rates = ['rest_errors', 'ws_errors', 'delivery_errors'];

export async function summarize(lines) {
  const plateaux = new Map();
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch { throw new Error(`JSON k6 invalide (ligne ${lineNumber}).`); }
    if (record?.type !== 'Point' || ![...trends, ...rates].includes(record.metric)) continue;
    const { tags = {}, value, time } = record.data ?? {};
    if (!/^palier_[1-9]\d*$/.test(tags.plateau)) continue;
    const timestamp = Date.parse(time);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(timestamp) ||
        (rates.includes(record.metric) && value !== 0 && value !== 1)) {
      throw new Error(`Point k6 invalide (ligne ${lineNumber}).`);
    }
    const { plateau } = tags;
    if (!plateaux.has(plateau)) {
      plateaux.set(plateau, { vus: tags.vus, duration: tags.duration_s, start: timestamp, end: timestamp, metrics: new Map() });
    }
    const entry = plateaux.get(plateau);
    if (entry.vus !== tags.vus || entry.duration !== tags.duration_s) {
      throw new Error(`Paramètres divergents pour ${plateau} (ligne ${lineNumber}).`);
    }
    entry.start = Math.min(entry.start, timestamp);
    entry.end = Math.max(entry.end, timestamp);
    if (!entry.metrics.has(record.metric)) entry.metrics.set(record.metric, []);
    entry.metrics.get(record.metric).push(value);
  }
  return plateaux;
}

function percentile(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * 0.95;
  const lower = Math.floor(position);
  return sorted[lower] + (position - lower) * (sorted[Math.ceil(position)] - sorted[lower]);
}

function cell(values, rate = false) {
  if (!values?.length) return 'non mesuré';
  if (!rate) return `${percentile(values).toFixed(1)} (n=${values.length})`;
  const failed = values.reduce((sum, value) => sum + value, 0);
  return `${(100 * failed / values.length).toFixed(2)} % (${failed}/${values.length})`;
}

export function markdown(plateaux) {
  const result = [
    '| Palier | VU | Durée prévue (s) | Premier / dernier point UTC | REST p95 (ms) | Ouverture WSS p95 (ms) | Livraison p95 (ms) | Erreurs REST | Erreurs WSS | Échecs de livraison |',
    '|---|---:|---:|---|---:|---:|---:|---:|---:|---:|',
  ];
  if (!plateaux.size) result.push(`| ${Array(10).fill('non mesuré').join(' | ')} |`);
  for (const [name, { vus, duration, start, end, metrics }] of [...plateaux].sort(([a], [b]) => Number(a.split('_')[1]) - Number(b.split('_')[1]))) {
    const numericTag = value => /^[1-9]\d*$/.test(value) ? value : 'non mesuré';
    const range = [start, end].map(value => new Date(value).toISOString()).join(' / ');
    const fields = [
      name, numericTag(vus), numericTag(duration), range,
      ...trends.map(metric => cell(metrics.get(metric))),
      ...rates.map(metric => cell(metrics.get(metric), true)),
    ];
    result.push(`| ${fields.join(' | ')} |`);
  }
  return result.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage : node tests/load/synthese.mjs <k6.jsonl>');
    const lines = createInterface({ input: createReadStream(process.argv[2]), crlfDelay: Infinity });
    console.log(markdown(await summarize(lines)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
