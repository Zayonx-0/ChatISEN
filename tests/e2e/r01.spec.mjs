import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);
const project = process.env.R01_COMPOSE_PROJECT;
const composeFile = resolve('infra/compose/docker-compose.yml');
const password = 'r01-test-password-2026';

async function compose(...args) {
  if (!/^r01-e2e-[a-z0-9-]+$/.test(project || '')) {
    throw new Error('R01_COMPOSE_PROJECT doit désigner un projet jetable nommé r01-e2e-…');
  }
  return run('docker', ['compose', '-p', project, '-f', composeFile, ...args], { timeout: 60_000 });
}

async function register(page, handle, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await page.getByLabel('Nom affiché').fill(name);
  await page.getByLabel('Identifiant').fill(handle);
  await page.getByLabel('Mot de passe').fill(password);
  const result = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'S’inscrire' }).click();
  expect((await result).status()).toBe(201);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
}

async function search(page, handle) {
  await page.getByLabel('Rechercher un identifiant exact').fill(handle);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.getByText(`@${handle}`, { exact: false })).toBeVisible();
}

async function send(page, message) {
  await page.getByLabel('Message').fill(message);
  const response = page.waitForResponse(r => /\/api\/v1\/conversations\/[^/]+\/messages$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  expect([200, 201]).toContain((await response).status());
  await expect(page.locator('.messages').getByText(message, { exact: true })).toHaveCount(1);
}

test('deux comptes : direct, mobile, reprise et persistance PostgreSQL', async ({ browser }, testInfo) => {
  const origin = new URL(process.env.R01_BASE_URL || 'https://localhost');
  expect(origin.protocol, 'HTTPS requis pour le cookie __Host-').toBe('https:');
  // Fail before touching the server when the restart target has not been explicitly isolated.
  expect(project || '').toMatch(/^r01-e2e-[a-z0-9-]+$/);
  const suffix = randomBytes(5).toString('hex');
  const alice = `r01a_${suffix}`;
  const bob = `r01b_${suffix}`;
  const group = `Groupe ${suffix}`;
  const first = `Bonjour ${suffix}`;
  const answer = `Réponse ${suffix}`;
  const missed = Array.from({ length: 20 }, (_, i) => `Rattrapage ${suffix} ${String(i + 1).padStart(2, '0')}`);
  const desktop = await browser.newContext({ baseURL: origin.origin, viewport: { width: 1280, height: 800 } });
  const mobile = await browser.newContext({ baseURL: origin.origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Explicit contexts must start their own traces; the runner's automatic trace covers its own context only.
  await desktop.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await mobile.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    const a = await desktop.newPage();
    let b = await mobile.newPage();
    await register(a, alice, 'Alice R01');
    await register(b, bob, 'Bob R01');
    for (const context of [desktop, mobile]) {
      const cookie = (await context.cookies()).find(c => c.name === '__Host-chatisen');
      expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: '/', sameSite: 'Lax' });
    }
    await search(a, bob);
    await a.getByRole('button', { name: 'Ouvrir une conversation' }).click();
    await expect(a.getByRole('heading', { name: 'Bob R01' })).toBeVisible();
    await b.reload();
    await b.getByRole('button', { name: /Alice R01.*Conversation privée/ }).click();
    await expect(b.getByRole('button', { name: '← Conversations' })).toBeVisible();
    await expect(b.getByText('Connecté · Bob R01')).toBeVisible();
    await send(a, first);
    await expect(b.locator('.messages').getByText(first, { exact: true })).toHaveCount(1);
    await send(b, answer);
    await expect(a.locator('.messages').getByText(answer, { exact: true })).toHaveCount(1);

    // A closed page ensures Bob has no open socket for the entire offline window.
    await b.close();
    const offlineSince = Date.now();
    for (const message of missed) await send(a, message);
    const remaining = 15_000 - (Date.now() - offlineSince);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    b = await mobile.newPage();
    await b.goto('/');
    await b.getByRole('button', { name: /Alice R01.*Conversation privée/ }).click();
    for (const message of missed) await expect(b.locator('.messages').getByText(message, { exact: true })).toHaveCount(1);

    // Exercise switching threads on the 390px viewport.
    await search(a, bob);
    a.once('dialog', dialog => dialog.accept(group));
    await a.getByRole('button', { name: 'Créer un groupe avec ce contact' }).click();
    await expect(a.getByRole('heading', { name: group })).toBeVisible();
    await b.getByRole('button', { name: '← Conversations' }).click();
    await b.reload();
    await b.getByRole('button', { name: new RegExp(group) }).click();
    await expect(b.getByRole('heading', { name: group })).toBeVisible();
    await b.getByRole('button', { name: '← Conversations' }).click();
    await b.getByRole('button', { name: /Alice R01.*Conversation privée/ }).click();
    await expect(b.locator('.messages').getByText(answer, { exact: true })).toHaveCount(1);

    // Checking the generated markers in this exact project's database also binds
    // the browser endpoint to the disposable project selected for restart.
    const sql = `SELECT (SELECT count(*) FROM users WHERE handle IN ('${alice}','${bob}')) || ',' || (SELECT count(*) FROM messages WHERE text='${first}');`;
    const dbBefore = await compose('exec', '-T', 'postgres', 'psql', '-U', 'chatisen', '-d', 'chatisen', '-At', '-c', sql);
    expect(dbBefore.stdout.trim()).toBe('2,1');
    await compose('restart', 'api');
    await expect.poll(async () => {
      try { return await a.evaluate(async () => (await fetch('/api/v1/me', { credentials: 'include' })).status); }
      catch { return 0; }
    }, { timeout: 45_000 }).toBe(200);
    await Promise.all([a.reload(), b.reload()]);
    await expect(a.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
    await expect(b.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
    await b.getByRole('button', { name: /Alice R01.*Conversation privée/ }).click();
    await expect(b.locator('.messages').getByText(first, { exact: true })).toHaveCount(1);
    await expect(b.locator('.messages').getByText(answer, { exact: true })).toHaveCount(1);
    for (const message of missed) await expect(b.locator('.messages').getByText(message, { exact: true })).toHaveCount(1);
    const dbAfter = await compose('exec', '-T', 'postgres', 'psql', '-U', 'chatisen', '-d', 'chatisen', '-At', '-c', sql);
    expect(dbAfter.stdout.trim()).toBe('2,1');
    await testInfo.attach('observations.txt', { body: `Projet ${project}\nComptes ${alice}, ${bob}\nSQL avant/après : ${dbBefore.stdout.trim()} / ${dbAfter.stdout.trim()}\n20 messages uniques récupérés après au moins 15 s hors ligne.\n`, contentType: 'text/plain' });
  } finally {
    const aliceTrace = testInfo.outputPath('alice-trace.zip');
    const bobTrace = testInfo.outputPath('bob-trace.zip');
    await desktop.tracing.stop({ path: aliceTrace });
    await mobile.tracing.stop({ path: bobTrace });
    await testInfo.attach('alice-trace', { path: aliceTrace, contentType: 'application/zip' });
    await testInfo.attach('bob-trace', { path: bobTrace, contentType: 'application/zip' });
    await desktop.close();
    await mobile.close();
  }
});
