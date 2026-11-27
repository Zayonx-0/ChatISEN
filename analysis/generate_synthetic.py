import argparse
import hashlib
import random
import sys

from quality_csv import Sample, write_samples


def key(*parts):
    return hashlib.sha256((':'.join(('synthetique', *map(str, parts)))).encode()).hexdigest()


def generate(calls=32, seed=42):
    rng = random.Random(seed)
    for call in range(calls):
        scenario = 'audio' if call % 4 < 2 else 'video'
        candidate = 'relay' if call % 2 else 'srflx'
        fault = rng.choice(('perte', 'latence', 'debit', 'mixte'))
        start = rng.randint(3, 6)
        duration = rng.randint(2, 5)
        base_rtt = rng.uniform(25, 95) + (35 if candidate == 'relay' else 0)
        base_bitrate = rng.uniform(35, 75) if scenario == 'audio' else rng.uniform(350, 950)
        for peer in range(2):
            for window in range(12):
                label = int(start <= window < start + duration)
                packets = max(1, round(rng.gauss(230 if scenario == 'audio' else 450, 35)))
                loss = rng.gauss(0.6, 1.5) + (rng.uniform(2, 12) if label and fault in ('perte', 'mixte') else 0)
                lost = min(packets, max(0, round(packets * loss / 100)))
                jitter = rng.gauss(12, 7) + (rng.uniform(10, 55) if label and fault in ('latence', 'mixte') else 0)
                rtt = rng.gauss(base_rtt, 25) + (rng.uniform(70, 430) if label and fault in ('latence', 'mixte') else 0)
                bitrate = max(0, rng.gauss(base_bitrate, base_bitrate * 0.18))
                if label and fault in ('debit', 'mixte'):
                    bitrate *= rng.uniform(0.15, 0.75)
                yield Sample(
                    'synthetique', scenario, key(seed, call), key(seed, call, peer), window * 5_000_000,
                    packets - lost, lost, round(max(0, jitter), 3), round(max(0, rtt), 3),
                    round(bitrate, 3), candidate, label,
                )


def main():
    parser = argparse.ArgumentParser(description='Génère uniquement des données SYNTHÉTIQUES pour tester le pipeline.')
    parser.add_argument('--calls', type=int, default=32)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    if args.calls < 1:
        parser.error('--calls doit être positif.')
    print('SYNTHÉTIQUE — non mesuré.', file=sys.stderr)
    write_samples(sys.stdout, generate(args.calls, args.seed))


if __name__ == '__main__':
    main()
