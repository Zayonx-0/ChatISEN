import { spawnSync } from 'node:child_process';

const level = process.env.LEVEL || 'core';
if (!['core', 'full'].includes(level)) {
  console.error(`Niveau inconnu : ${level} (attendu : core ou full)`);
  process.exit(1);
}
for (const command of ['typecheck', 'build', 'test']) {
  const result = spawnSync('pnpm', [command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.error(`Recette ${level} incomplète : les scénarios R01 sur Compose, PostgreSQL, navigateurs et média ne sont pas encore automatisés. Aucun résultat de réception ne peut être déclaré.`);
if (level === 'full') console.error('Les scénarios J2/J3 restent également ouverts.');
process.exitCode = 1;
