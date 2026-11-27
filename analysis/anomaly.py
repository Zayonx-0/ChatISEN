import argparse
import json
import math
import random
from collections import Counter
from statistics import mean, pstdev

from quality_csv import read_samples, source_status


def features(sample):
    return (
        sample.loss_pct or 0, sample.jitter_ms, sample.rtt_ms, math.log1p(sample.bitrate_kbps),
        int(sample.packets_received == 0),
    )


def baseline(sample):
    return int((sample.loss_pct or 0) > 8 or sample.rtt_ms > 400 or sample.packets_received == 0)


def sigmoid(value):
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exponential = math.exp(value)
    return exponential / (1 + exponential)


def fit(train, epochs=350, learning_rate=0.2, penalty=0.02):
    matrix = [features(sample) for sample in train]
    columns = list(zip(*matrix))
    centers = [mean(column) for column in columns]
    scales = [pstdev(column) or 1 for column in columns]

    def normalize(row):
        return [1.0, *((value - center) / scale for value, center, scale in zip(row, centers, scales))]

    normalized = [normalize(row) for row in matrix]
    weights = [0.0] * (len(centers) + 1)
    for _ in range(epochs):
        gradients = [0.0] * len(weights)
        for row, sample in zip(normalized, train):
            error = sigmoid(sum(w * x for w, x in zip(weights, row))) - sample.label
            for i, value in enumerate(row):
                gradients[i] += error * value
        for i, gradient in enumerate(gradients):
            weights[i] -= learning_rate * (gradient / len(train) + (penalty * weights[i] if i else 0))

    def predict(sample):
        return int(sum(w * x for w, x in zip(weights, normalize(features(sample)))) >= 0)

    return predict


def split_calls(samples, seed, test_fraction=0.3):
    calls = sorted({sample.call_key for sample in samples})
    if len(calls) < 2:
        raise ValueError('Il faut au moins deux appels étiquetés distincts.')
    random.Random(seed).shuffle(calls)
    count = min(len(calls) - 1, max(1, round(len(calls) * test_fraction)))
    held_out = set(calls[:count])
    train = [sample for sample in samples if sample.call_key not in held_out]
    test = [sample for sample in samples if sample.call_key in held_out]
    if any({sample.label for sample in part} != {0, 1} for part in (train, test)):
        raise ValueError('La séparation par appel exige des fenêtres positives et négatives dans chaque lot.')
    return train, test


def scores(samples, predict):
    counts = Counter((sample.label, predict(sample)) for sample in samples)
    tp, fp, fn, tn = [counts[key] for key in ((1, 1), (0, 1), (1, 0), (0, 0))]

    def ratio(numerator, denominator):
        return numerator / denominator if denominator else None

    return {
        'vrais_positifs': tp, 'faux_positifs': fp, 'faux_negatifs': fn, 'vrais_negatifs': tn,
        'precision': ratio(tp, tp + fp), 'rappel': ratio(tp, tp + fn),
        'f1': ratio(2 * tp, 2 * tp + fp + fn),
    }


def evaluate(samples, seed=42):
    report = {
        'statut': source_status(samples), 'graine': seed,
        'fenetres_non_etiquetees': sum(sample.label is None for sample in samples),
        'evaluation': 'non mesuré',
    }
    labeled = [sample for sample in samples if sample.label is not None]
    if not labeled:
        return report
    train, test = split_calls(labeled, seed)
    report['evaluation'] = {
        'appels_entrainement': len({sample.call_key for sample in train}),
        'appels_test': len({sample.call_key for sample in test}),
        'fenetres_entrainement': len(train),
        'fenetres_test': len(test),
        'seuils': scores(test, baseline),
        'regression_logistique': scores(test, fit(train)),
    }
    return report


def main():
    parser = argparse.ArgumentParser(description='Compare des seuils et une régression logistique sur des appels tenus à part.')
    parser.add_argument('csv', nargs='?')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    try:
        samples = []
        if args.csv:
            with open(args.csv, newline='', encoding='utf-8') as stream:
                samples = read_samples(stream)
        report = evaluate(samples, args.seed)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
