import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflows = ['.github/workflows/r01.yml', '.github/workflows/images.yml'].map(path => readFileSync(path, 'utf8'));

test('CI : l’audit des dépendances peut réellement échouer', () => {
  for (const workflow of workflows) {
    const audits = workflow.split('\n').filter(line => line.includes('pnpm audit'));
    assert.deepEqual(audits.map(line => line.trim()), ['run: pnpm audit --audit-level high']);
    // Avec pnpm 10, ces options font réussir l'audit même avec des failles corrigeables.
    assert.doesNotMatch(workflow, /--ignore-unfixable|--ignore-registry-errors|continue-on-error/);
  }
});

test('CI : actions et image de scan figées par leur empreinte', () => {
  for (const workflow of workflows) {
    for (const [, action] of workflow.matchAll(/uses:\s+(\S+)/g)) {
      if (!action.startsWith('./')) assert.match(action, /@[0-9a-f]{40}$/, action);
    }
  }
  for (const source of [workflows[0], readFileSync('infra/gcp/cd/publish.sh', 'utf8')]) {
    assert.match(source, /aquasec\/trivy:[\d.]+@sha256:[0-9a-f]{64} /);
  }
});
