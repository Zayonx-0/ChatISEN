import io
import random
import unittest

from anomaly import baseline, evaluate, scores, split_calls
from export_quality import export_query, export_samples, read_manifest
from generate_synthetic import generate
from quality_csv import read_samples, write_samples
from study import correlation, study, svg_chart


MANIFEST = """call_id,scenario,start_utc,end_utc,label
00000000-0000-4000-8000-000000000001,reference,2026-01-01T00:00:00Z,2026-01-01T00:00:10Z,0
00000000-0000-4000-8000-000000000001,latence,2026-01-01T00:00:10Z,2026-01-01T00:00:20Z,1
00000000-0000-4000-8000-000000000002,latence,2026-01-01T00:00:10Z,2026-01-01T00:00:20Z,1
"""
RAW = """0,00000000-0000-4000-8000-000000000003,1767225605000001,92,8,3,17,75,srflx
1,00000000-0000-4000-8000-000000000003,1767225610000000,88,12,9,33,65,relay
2,00000000-0000-4000-8000-000000000003,1767225610000000,88,12,9,33,65,relay
"""


def csv_stream(samples):
    stream = io.StringIO()
    write_samples(stream, samples)
    stream.seek(0)
    return stream


class ExportTest(unittest.TestCase):
    def test_hmac_and_selective_read(self):
        intervals = read_manifest(io.StringIO(MANIFEST))
        sql = export_query(intervals)
        self.assertIn('BEGIN READ ONLY', sql)
        self.assertIn('JOIN quality.samples', sql)
        self.assertIn('s.captured_at < i.end_at', sql)
        first, second, other_call = export_samples(io.StringIO(RAW), intervals, b'a' * 32)
        self.assertEqual(first.call_key, second.call_key)
        self.assertEqual(first.participant_key, second.participant_key)
        self.assertNotEqual(second.participant_key, other_call.participant_key)
        self.assertEqual((first.elapsed_us, second.elapsed_us, other_call.elapsed_us), (5_000_001, 10_000_000, 0))
        self.assertEqual((first.label, second.label, second.path), (0, 1, 'relais'))
        self.assertEqual(first.loss_pct, 8)
        different = export_samples(io.StringIO(RAW), intervals, b'b' * 32)[0]
        self.assertNotEqual(first.call_key, different.call_key)
        stream = csv_stream([first, second, other_call])
        self.assertNotIn(intervals[0].call_id, stream.getvalue())
        self.assertNotIn('2026-01-01', stream.getvalue())
        self.assertEqual(read_samples(stream), [first, second, other_call])

    def test_invalid_inputs(self):
        with self.assertRaisesRegex(ValueError, 'chevauchent'):
            read_manifest(io.StringIO(MANIFEST.replace('00:00:10Z,0', '00:00:11Z,0')))
        with self.assertRaisesRegex(ValueError, 'Intervalle invalide'):
            read_manifest(io.StringIO(MANIFEST.replace(',reference,', ',=reference,')))
        sample = next(generate())
        with self.assertRaisesRegex(ValueError, 'double'):
            read_samples(csv_stream([sample, sample]))
        with self.assertRaisesRegex(ValueError, 'séparément'):
            read_samples(csv_stream([sample, sample._replace(source='mesure', elapsed_us=1)]))


class StudyTest(unittest.TestCase):
    def test_call_weight_and_missing_values(self):
        first, second = list(generate(2))[::24]
        samples = [
            first._replace(jitter_ms=0, packets_received=0, packets_lost=0),
            first._replace(elapsed_us=1, jitter_ms=20),
            second._replace(candidate_type='host', jitter_ms=30),
            second._replace(elapsed_us=2, jitter_ms=40, packets_received=0, packets_lost=0),
        ]
        report, curves = study(samples, replicates=100)
        self.assertEqual(report['statut'], 'SYNTHÉTIQUE — non mesuré')
        scenario = report['scenarios']['audio']
        direct = scenario['direct']['statistiques_des_moyennes_par_appel']
        relay = scenario['relais']['statistiques_des_moyennes_par_appel']
        self.assertEqual(direct['jitter_ms']['moyenne'], 20)
        self.assertIsNone(relay['loss_pct']['moyenne'])
        self.assertEqual(scenario['ecart_des_moyennes_relais_moins_direct']['jitter_ms'], 20)
        self.assertIn('SYNTHÉTIQUE', svg_chart(curves, report['statut']))
        self.assertEqual(study([])[0]['statut'], 'non mesuré')

    def test_bootstrap_and_degenerate_correlation(self):
        pairs = [(i, i * 2) for i in range(1, 9)]
        result = correlation(pairs, random.Random(3), 100)
        self.assertAlmostEqual(result['pearson_r'], 1)
        for bound in result['ic_95_bootstrap']:
            self.assertAlmostEqual(bound, 1)
        degenerate = correlation([(1, i) for i in range(5)], random.Random(3), 100)
        self.assertIsNone(degenerate['ic_95_bootstrap'])
        self.assertIsNone(degenerate['pearson_r'])


class AnomalyTest(unittest.TestCase):
    def test_replay_and_call_holdout(self):
        samples = read_samples(csv_stream(generate(8, seed=21)))
        self.assertEqual(samples, list(generate(8, seed=21)))
        train, test = split_calls(samples, 42)
        self.assertFalse({sample.call_key for sample in train} & {sample.call_key for sample in test})
        report = evaluate(samples)['evaluation']
        for method in ('seuils', 'regression_logistique'):
            self.assertEqual(sum(list(report[method].values())[:4]), len(test))
        self.assertEqual(evaluate([])['evaluation'], 'non mesuré')
        self.assertEqual(evaluate(samples)['statut'], 'SYNTHÉTIQUE — non mesuré')

    def test_scores_and_baseline(self):
        sample = next(generate())
        good = sample._replace(label=0, packets_received=100, packets_lost=0, rtt_ms=50)
        bad = good._replace(label=1, rtt_ms=401)
        missed = good._replace(label=1)
        result = scores([good, bad, missed], baseline)
        self.assertEqual((result['precision'], result['rappel'], result['f1']), (1, 0.5, 2 / 3))
        self.assertIsNone(scores([missed], baseline)['precision'])


if __name__ == '__main__':
    unittest.main()
