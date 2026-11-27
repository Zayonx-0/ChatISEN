import csv
import math
import re
from collections import namedtuple

FIELDS = (
    'source', 'scenario', 'call_key', 'participant_key', 'elapsed_us',
    'packets_received', 'packets_lost', 'jitter_ms', 'rtt_ms', 'bitrate_kbps',
    'candidate_type', 'label',
)
METRICS = ('loss_pct', 'jitter_ms', 'rtt_ms', 'bitrate_kbps')
SCENARIO = re.compile(r'[a-z][a-z0-9_-]{0,31}')
KEY = re.compile(r'[0-9a-f]{64}')
CANDIDATES = {'host', 'srflx', 'prflx', 'relay'}


class Sample(namedtuple('Sample', FIELDS)):
    __slots__ = ()

    @property
    def loss_pct(self):
        total = self.packets_received + self.packets_lost
        return 100 * self.packets_lost / total if total else None

    @property
    def path(self):
        return 'relais' if self.candidate_type == 'relay' else 'direct'


def parse_sample(row):
    source, scenario, call, participant = row[:4]
    if source not in {'mesure', 'synthetique'} or not SCENARIO.fullmatch(scenario):
        raise ValueError
    if not KEY.fullmatch(call) or not KEY.fullmatch(participant):
        raise ValueError
    counts = tuple(int(value) for value in row[4:7])
    metrics = tuple(float(value) for value in row[7:10])
    candidate, label = row[10:]
    if min(counts) < 0 or not all(math.isfinite(value) and value >= 0 for value in metrics):
        raise ValueError
    if candidate not in CANDIDATES or label not in ('', '0', '1'):
        raise ValueError
    return Sample(source, scenario, call, participant, *counts, *metrics, candidate, int(label) if label else None)


def read_samples(stream):
    reader = csv.reader(stream)
    if tuple(next(reader, [])) != FIELDS:
        raise ValueError('En-tête CSV inattendu.')
    samples = []
    seen = set()
    for line, row in enumerate(reader, 2):
        try:
            if len(row) != len(FIELDS):
                raise ValueError
            sample = parse_sample(row)
        except ValueError:
            raise ValueError(f'Fenêtre CSV invalide ligne {line}.') from None
        key = (sample.call_key, sample.participant_key, sample.elapsed_us)
        if key in seen:
            raise ValueError(f'Fenêtre CSV en double ligne {line}.')
        seen.add(key)
        samples.append(sample)
    if len({sample.source for sample in samples}) > 1:
        raise ValueError('Les mesures et les données synthétiques doivent être analysées séparément.')
    return samples


def write_samples(stream, samples):
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(FIELDS)
    writer.writerows(samples)


def source_status(samples):
    if not samples:
        return 'non mesuré'
    if samples[0].source == 'synthetique':
        return 'SYNTHÉTIQUE — non mesuré'
    return 'mesure'
