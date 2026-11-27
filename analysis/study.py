import argparse
import json
import math
import random
from collections import Counter, defaultdict
from html import escape
from itertools import combinations
from pathlib import Path
from statistics import mean, median

from quality_csv import METRICS, read_samples, source_status

PATHS = ('direct', 'relais')
AXES = ('Pertes (%)', 'Gigue (ms)', 'RTT (ms)', 'Débit reçu (kbit/s)')


def quantile(values, fraction):
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    low, high = math.floor(index), math.ceil(index)
    return ordered[low] + (index - low) * (ordered[high] - ordered[low])


def call_means(samples):
    calls = defaultdict(lambda: defaultdict(list))
    for sample in samples:
        for metric in METRICS:
            value = getattr(sample, metric)
            if value is not None:
                calls[sample.call_key][metric].append(value)
    return {
        call: {metric: mean(values) for metric, values in metrics.items()}
        for call, metrics in sorted(calls.items())
    }


def pearson(pairs):
    if len(pairs) < 3:
        return None
    left, right = zip(*pairs)
    center_left, center_right = mean(left), mean(right)
    left = [value - center_left for value in left]
    right = [value - center_right for value in right]
    denominator = math.sqrt(math.fsum(value ** 2 for value in left) * math.fsum(value ** 2 for value in right))
    if not denominator:
        return None
    coefficient = math.fsum(a * b for a, b in zip(left, right)) / denominator
    return max(-1, min(1, coefficient))


def correlation(pairs, rng, replicates):
    coefficient = pearson(pairs)
    draws = []
    if coefficient is not None:
        for _ in range(replicates):
            value = pearson(rng.choices(pairs, k=len(pairs)))
            if value is not None:
                draws.append(value)
    interval = None
    if len(draws) >= 0.9 * replicates:
        interval = [quantile(draws, 0.025), quantile(draws, 0.975)]
    return {
        'appels': len(pairs), 'pearson_r': coefficient,
        'ic_95_bootstrap': interval, 'tirages_valides': len(draws),
    }


def describe(samples, calls, rng, replicates):
    metrics = {}
    for metric in METRICS:
        values = [call[metric] for call in calls.values() if metric in call]
        metrics[metric] = {
            'appels': len(values), 'moyenne': mean(values) if values else None,
            'mediane': median(values) if values else None, 'p95': quantile(values, 0.95) if values else None,
        }
    correlations = {
        f'{left}__{right}': correlation(
            [(call[left], call[right]) for call in calls.values() if left in call and right in call],
            rng, replicates,
        )
        for left, right in combinations(METRICS, 2)
    }
    return {
        'fenetres': len(samples), 'appels': len(calls),
        'candidats_ice': dict(sorted(Counter(sample.candidate_type for sample in samples).items())),
        'statistiques_des_moyennes_par_appel': metrics, 'correlations_par_appel': correlations,
    }


def study(samples, seed=42, replicates=2000):
    by_scenario = defaultdict(lambda: defaultdict(list))
    for sample in samples:
        by_scenario[sample.scenario][sample.path].append(sample)
    rng = random.Random(seed)
    report = {}
    curves = {}
    for scenario, paths in sorted(by_scenario.items()):
        calls = {path: call_means(paths[path]) for path in PATHS}
        stats = {path: describe(paths[path], calls[path], rng, replicates) for path in PATHS}
        curves[scenario] = calls
        delta = {}
        for metric in METRICS:
            direct, relay = [stats[path]['statistiques_des_moyennes_par_appel'][metric]['moyenne'] for path in PATHS]
            delta[metric] = relay - direct if direct is not None and relay is not None else None
        report[scenario] = {
            **stats, 'appels_communs_aux_deux_chemins': len(calls['direct'].keys() & calls['relais'].keys()),
            'ecart_des_moyennes_relais_moins_direct': delta,
        }
    return {
        'statut': source_status(samples), 'graine': seed, 'tirages_bootstrap': replicates, 'scenarios': report,
    }, curves


def svg_chart(curves, status):
    width, row_height = 850, 390
    height = 65 + len(curves) * row_height
    colors = {'direct': '#126382', 'relais': '#a23b31'}
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">',
        '<title>Distributions cumulées des moyennes par appel</title>',
        '<rect width="100%" height="100%" fill="#fff"/>',
        '<g font-family="sans-serif" font-size="13" fill="#182832">',
        f'<text x="24" y="25" font-size="18">Distributions cumulées · {escape(status)}</text>',
        '<text x="24" y="47">Y · % des appels</text>',
        '<text x="180" y="47" fill="#126382">Direct</text><text x="238" y="47" fill="#a23b31">Relais</text>',
    ]
    for index, (scenario, paths) in enumerate(curves.items()):
        top = 65 + index * row_height
        svg.append(f'<text x="24" y="{top + 18}" font-weight="bold">{escape(scenario)}</text>')
        for i, (metric, axis) in enumerate(zip(METRICS, AXES)):
            x = 54 + (i % 2) * 418
            y = top + 52 + (i // 2) * 169
            w, h = 320, 103
            points = {
                path: sorted(call[metric] for call in calls.values() if metric in call)
                for path, calls in paths.items()
            }
            scale = max((values[-1] for values in points.values() if values), default=0) or 1
            svg.append(f'<text x="{x}" y="{y - 13}">{axis}</text>')
            svg.append(f'<path d="M{x} {y}v{h}h{w}" fill="none" stroke="#627481"/>')
            svg.append(f'<text x="{x - 29}" y="{y + 5}">100</text>')
            svg.append(f'<text x="{x}" y="{y + h + 17}">0</text>')
            svg.append(f'<text x="{x + w}" y="{y + h + 17}" text-anchor="end">{scale:.3g}</text>')
            for path, values in points.items():
                if not values:
                    continue
                steps = [f'M{x} {y + h}']
                for rank, value in enumerate(values, 1):
                    steps.append(f'H{x + w * value / scale:.2f}V{y + h * (1 - rank / len(values)):.2f}')
                steps.append(f'H{x + w}')
                dash = ' stroke-dasharray="6 3"' if path == 'relais' else ''
                svg.append(f'<path d="{"".join(steps)}" fill="none" stroke="{colors[path]}" stroke-width="2"{dash}/>')
    return '\n'.join([*svg, '</g>', '</svg>'])


def main():
    parser = argparse.ArgumentParser(description='Compare les distributions et corrélations des fenêtres de qualité.')
    parser.add_argument('csv', nargs='?', help='CSV issu de export_quality.py ou generate_synthetic.py')
    parser.add_argument('--svg', type=Path, help='Sortie des courbes de distribution')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--bootstrap', type=int, default=2000)
    args = parser.parse_args()
    if args.bootstrap < 1:
        parser.error('--bootstrap doit être positif.')
    try:
        samples = []
        if args.csv:
            with open(args.csv, newline='', encoding='utf-8') as stream:
                samples = read_samples(stream)
        report, curves = study(samples, args.seed, args.bootstrap)
        if args.svg:
            args.svg.write_text(svg_chart(curves, report['statut']), encoding='utf-8')
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
