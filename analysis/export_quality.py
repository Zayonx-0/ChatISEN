import argparse
import csv
import hashlib
import hmac
import io
import os
import re
import subprocess
import sys
import uuid
from collections import defaultdict, namedtuple
from datetime import datetime, timezone

from quality_csv import SCENARIO, parse_sample, write_samples

MANIFEST = ('call_id', 'scenario', 'start_utc', 'end_utc', 'label')
Interval = namedtuple('Interval', MANIFEST)
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def timestamp(value):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z', value):
        raise ValueError
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def read_manifest(stream):
    reader = csv.reader(stream)
    if tuple(next(reader, [])) != MANIFEST:
        raise ValueError('En-tête du manifeste inattendu.')
    intervals = []
    by_call = defaultdict(list)
    for line, row in enumerate(reader, 2):
        try:
            call, scenario, start, end, label = row
            start, end = timestamp(start), timestamp(end)
            call = str(uuid.UUID(call))
            if not SCENARIO.fullmatch(scenario) or start >= end or label not in ('', '0', '1'):
                raise ValueError
        except ValueError:
            raise ValueError(f'Intervalle invalide ligne {line}.') from None
        interval = Interval(call, scenario, start, end, label)
        by_call[call].append(interval)
        intervals.append(interval)
    if not intervals:
        raise ValueError('Manifeste vide.')
    for series in by_call.values():
        ordered = sorted(series, key=lambda item: item.start_utc)
        if any(left.end_utc > right.start_utc for left, right in zip(ordered, ordered[1:])):
            raise ValueError('Intervalles qui se chevauchent pour un même appel.')
    return intervals


def export_query(intervals):
    # Les UUID et dates ont été parsés avant la construction des littéraux SQL.
    values = ',\n'.join(
        f"({index}, '{item.call_id}'::uuid, '{item.start_utc.isoformat()}'::timestamptz, "
        f"'{item.end_utc.isoformat()}'::timestamptz)"
        for index, item in enumerate(intervals)
    )
    return f"""BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH intervals (ordinal, call_id, start_at, end_at) AS (VALUES {values})
SELECT i.ordinal, s.participant_user_id,
       (extract(epoch FROM s.captured_at) * 1000000)::bigint,
       s.packets_received, s.packets_lost, s.jitter_ms, s.rtt_ms, s.bitrate_kbps, s.candidate_type
FROM intervals i JOIN quality.samples s ON s.call_id = i.call_id
WHERE s.captured_at >= i.start_at AND s.captured_at < i.end_at
ORDER BY i.call_id, s.captured_at, s.participant_user_id;
COMMIT;
"""


def export_samples(raw, intervals, salt):
    starts = {}
    for item in intervals:
        delta = item.start_utc - EPOCH
        start = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
        starts[item.call_id] = min(start, starts.get(item.call_id, start))
    samples = []
    for row in csv.reader(raw):
        try:
            ordinal, participant, captured, *metrics = row
            index = int(ordinal)
            if index < 0:
                raise ValueError
            item = intervals[index]
            call_key = hmac.new(salt, f'call:{item.call_id}'.encode(), hashlib.sha256).hexdigest()
            participant = str(uuid.UUID(participant))
            peer_key = hmac.new(salt, f'participant:{item.call_id}:{participant}'.encode(), hashlib.sha256).hexdigest()
            samples.append(parse_sample([
                'mesure', item.scenario, call_key, peer_key,
                str(int(captured) - starts[item.call_id]), *metrics, item.label,
            ]))
        except (IndexError, ValueError):
            raise ValueError('Ligne de mesure PostgreSQL invalide.') from None
    return samples


def main():
    parser = argparse.ArgumentParser(description='Exporte les fenêtres des appels de banc par une connexion psql en lecture seule.')
    parser.add_argument('manifest', help='CSV privé des appels et intervalles de banc')
    args = parser.parse_args()
    text_salt = os.environ.pop('QUALITY_HMAC_SALT', '')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', text_salt):
        parser.error('QUALITY_HMAC_SALT doit contenir 32 octets aléatoires encodés en hexadécimal.')
    try:
        with open(args.manifest, newline='', encoding='utf-8') as stream:
            intervals = read_manifest(stream)
        result = subprocess.run(
            ['psql', '-X', '-w', '--csv', '-tq', '-v', 'ON_ERROR_STOP=1'],
            input=export_query(intervals), capture_output=True, text=True, check=True, timeout=45,
        )
        samples = export_samples(io.StringIO(result.stdout), intervals, bytes.fromhex(text_salt))
    except (OSError, subprocess.SubprocessError):
        parser.exit(1, 'Échec de lecture du manifeste ou de PostgreSQL. Vérifier psql, la connexion et les droits.\n')
    except ValueError as error:
        parser.exit(1, f'{error}\n')
    write_samples(sys.stdout, samples)
    if not samples:
        print('Export vide : non mesuré.', file=sys.stderr)


if __name__ == '__main__':
    main()
