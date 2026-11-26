#!/usr/bin/env python3
"""Agent de déploiement continu de la démo ChatISEN.

La VM vient chercher la mise à jour : GitHub n'a ni clé SSH ni accès entrant.
Seul le dernier commit de la branche suivie est déployé, et seulement quand le
contrôle de CI attendu a réussi sur ce commit.

L'agent est copié dans /usr/local/sbin par install-cd.sh. Il tourne en root et
n'exécute aucun fichier du dépôt : un commit ne peut pas modifier ce qu'il fait.
"""

import argparse
import fcntl
import http.client
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Ces fichiers modifient la configuration système : leur installation reste manuelle.
MANUAL_FILES = ('ops/gcp/Caddyfile.template', 'ops/gcp/chatisen.service')
# Un changement sous ces chemins impose de redémarrer le serveur de démonstration.
RESTART_PREFIXES = ('apps/standalone/', 'apps/web/public/')
BACKUPS_KEPT = 10


def log(message):
    print(message, flush=True)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def write_json(path, data, mode):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


class Config:
    def __init__(self, env):
        get = env.get
        self.repo = Path(get('CHATISEN_CD_REPO_DIR', '/opt/chatisen/app'))
        self.slug = get('CHATISEN_CD_SLUG', 'Zayonx-0/ChatISEN')
        self.branch = get('CHATISEN_CD_BRANCH', 'main')
        self.check = get('CHATISEN_CD_CHECK', 'Builds, tests et configuration Compose')
        self.api = get('CHATISEN_CD_API', 'https://api.github.com')
        self.state_dir = Path(get('CHATISEN_CD_STATE_DIR', '/var/lib/chatisen-deploy'))
        self.backup_dir = Path(get('CHATISEN_CD_BACKUP_DIR', '/var/backups/chatisen'))
        self.data_file = Path(get('CHATISEN_CD_DATA_FILE', '/var/lib/chatisen/chatisen.json'))
        self.pause_file = Path(get('CHATISEN_CD_PAUSE_FILE', '/etc/chatisen/deploy.pause'))
        self.service = get('CHATISEN_CD_SERVICE', 'chatisen')
        self.app_url = get('CHATISEN_CD_APP_URL', 'http://127.0.0.1:3000/readyz')
        self.viewer_url = get('CHATISEN_CD_VIEWER_URL', '')


class Agent:
    def __init__(self, config, clock=time.time):
        self.config = config
        self.clock = clock
        self.state_path = config.state_dir / 'state.json'
        self.version_path = config.state_dir / 'public' / 'version.json'

    # --- Accès au monde extérieur (remplacés dans les tests) -----------------

    def git(self, *args):
        result = subprocess.run(['git', '-C', str(self.config.repo), *args],
                                check=True, capture_output=True, text=True, timeout=120)
        return result.stdout.strip()

    def fetch_check_runs(self, sha):
        query = urllib.parse.urlencode({'check_name': self.config.check, 'filter': 'latest'})
        url = f'{self.config.api}/repos/{self.config.slug}/commits/{sha}/check-runs?{query}'
        request = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github+json', 'User-Agent': 'deploy-agent'})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)['check_runs']

    def restart_service(self):
        subprocess.run(['systemctl', 'restart', self.config.service], check=True, timeout=90)

    def probe(self):
        """Vrai si le serveur répond, et le lecteur d'architecture s'il est configuré."""
        for url in filter(None, (self.config.app_url, self.config.viewer_url)):
            try:
                with urllib.request.urlopen(url, timeout=8) as response:
                    if response.status != 200:
                        return False
            except (urllib.error.URLError, OSError, http.client.HTTPException):
                return False
        return True

    def pause(self, seconds):
        time.sleep(seconds)

    # --- Décisions ----------------------------------------------------------

    def healthy(self, attempts=15):
        """Deux réponses correctes de suite : un serveur qui redémarre en boucle échoue."""
        successes = 0
        for _ in range(attempts):
            successes = successes + 1 if self.probe() else 0
            if successes == 2:
                return True
            self.pause(2)
        return False

    def ci_verdict(self, sha):
        try:
            runs = self.fetch_check_runs(sha)
        except (urllib.error.URLError, OSError, http.client.HTTPException, ValueError, KeyError) as error:
            log(f'CI illisible pour {sha[:7]} : {error}')
            return 'pending'
        runs = [run for run in runs
                if run.get('name') == self.config.check
                and (run.get('app') or {}).get('slug') == 'github-actions']
        if any(run.get('status') == 'completed' and run.get('conclusion') != 'success' for run in runs):
            return 'failure'
        if runs and all(run.get('status') == 'completed' for run in runs):
            return 'success'
        return 'pending'

    def should_query_ci(self, state, sha):
        """Espace les appels : l'API anonyme de GitHub est limitée à 60 par heure."""
        ci = state.get('ci') or {}
        if ci.get('sha') != sha:
            return True
        waited = self.clock() - ci.get('first', 0)
        interval = 300 if ci.get('verdict') == 'failure' or waited > 1200 else 45
        return self.clock() - ci.get('last', 0) >= interval

    def save_state(self, state):
        write_json(self.state_path, state, 0o600)

    def publish(self, commit, status, target, reason=''):
        previous = read_json(self.version_path)
        data = {'commit': commit, 'status': status, 'target': target, 'reason': reason}
        if all(previous.get(key) == value for key, value in data.items()):
            return
        write_json(self.version_path, {**data, 'updatedAt': now_iso()}, 0o644)

    def changed_files(self, old, new):
        return self.git('diff', '--name-only', '--no-renames', old, new).splitlines()

    def runtime_dependencies(self, sha):
        return json.loads(self.git('show', f'{sha}:package.json')).get('dependencies') or {}

    def manual_reason(self, old, new, files):
        touched = [name for name in MANUAL_FILES if name in files]
        if 'package.json' in files and self.runtime_dependencies(old) != self.runtime_dependencies(new):
            touched.append('package.json (dépendances de production)')
        if touched:
            return 'Installation manuelle requise : ' + ', '.join(touched)
        return ''

    def backup_data(self, sha):
        source = self.config.data_file
        if not source.exists():
            return None
        for _ in range(5):
            content = source.read_bytes()
            try:
                json.loads(content)
                break
            except ValueError:
                self.pause(1)
        else:
            raise RuntimeError('fichier de données illisible : redémarrage annulé')
        self.config.backup_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(self.config.backup_dir, 0o700)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        target = self.config.backup_dir / f'chatisen-{stamp}-avant-{sha[:7]}.json'
        with open(target, 'xb', opener=lambda path, flags: os.open(path, flags, 0o600)) as handle:
            handle.write(content)
        for old in sorted(self.config.backup_dir.glob('chatisen-*.json'))[:-BACKUPS_KEPT]:
            old.unlink()
        return target

    # --- Déploiement --------------------------------------------------------

    def roll_back(self, state, previous, target, restart, cause):
        log(f'Échec du déploiement de {target[:7]} ({cause}) : retour à {previous[:7]}')
        self.git('checkout', '--quiet', '--detach', previous)
        if restart:
            self.restart_service()
        restored = self.healthy()
        state.pop('in_progress', None)
        state['failed'] = target
        self.save_state(state)
        reason = ('Contrôle de santé en échec ; version précédente rétablie' if restored
                  else 'Contrôle de santé en échec, y compris après retour : intervention requise')
        self.publish(previous, 'rolled_back' if restored else 'broken', target, reason)
        return 'rolled_back' if restored else 'broken'

    def deploy(self, state, previous, target, files):
        restart = any(name.startswith(RESTART_PREFIXES) for name in files)
        if restart:
            backup = self.backup_data(target)
            log(f'Données copiées : {backup}' if backup else 'Aucun fichier de données à copier')
        state['in_progress'] = {'from': previous, 'to': target, 'restart': restart}
        self.save_state(state)
        try:
            self.git('checkout', '--quiet', '--detach', target)
            if restart:
                self.restart_service()
            if not self.healthy():
                raise RuntimeError('contrôle de santé')
        except (subprocess.SubprocessError, OSError, RuntimeError) as error:
            return self.roll_back(state, previous, target, restart, error)
        self.save_state({})
        self.publish(target, 'deployed', target)
        log(f'Déployé : {previous[:7]} → {target[:7]} ({"avec" if restart else "sans"} redémarrage)')
        return 'deployed'

    def resume(self, state):
        """Termine un déploiement interrompu (arrêt de la VM, agent tué)."""
        pending = state['in_progress']
        previous, target = pending['from'], pending['to']
        if self.git('rev-parse', 'HEAD') == target:
            if pending['restart']:
                self.restart_service()
            if self.healthy():
                self.save_state({})
                self.publish(target, 'deployed', target)
                return 'deployed'
        return self.roll_back(state, previous, target, pending['restart'], 'déploiement interrompu')

    def block(self, state, current, target, reason):
        log(f'{target[:7]} non déployé. {reason}')
        self.publish(current, 'blocked', target, reason)
        return 'blocked'

    def run_once(self):
        if self.config.pause_file.exists():
            log(f'En pause : {self.config.pause_file} existe')
            return 'paused'
        state = read_json(self.state_path)
        if 'in_progress' in state:
            return self.resume(state)
        current = self.git('rev-parse', 'HEAD')
        listing = self.git('ls-remote', 'origin', f'refs/heads/{self.config.branch}')
        if not listing:
            raise RuntimeError(f'branche {self.config.branch} introuvable sur origin')
        target = listing.split()[0]
        if target == current:
            self.publish(current, 'deployed', current)
            if state:
                self.save_state({})
            return 'up_to_date'
        if state.get('failed') == target:
            return 'already_failed'

        if not self.should_query_ci(state, target):
            return 'waiting'
        verdict = self.ci_verdict(target)
        ci = state.get('ci') or {}
        first = ci.get('first') if ci.get('sha') == target else self.clock()
        state['ci'] = {'sha': target, 'verdict': verdict, 'first': first, 'last': self.clock()}
        self.save_state(state)
        if verdict == 'pending':
            log(f'{target[:7]} : CI en cours')
            return 'waiting'
        if verdict == 'failure':
            return self.block(state, current, target, 'La CI a échoué sur ce commit')

        if self.git('status', '--porcelain'):
            return self.block(state, current, target, 'Le dépôt du serveur contient des modifications locales')
        self.git('fetch', '--quiet', 'origin', self.config.branch)
        if self.git('rev-parse', 'FETCH_HEAD') != target:
            return 'waiting'  # La branche a bougé : le prochain passage reprendra.
        try:
            self.git('merge-base', '--is-ancestor', current, target)
        except subprocess.CalledProcessError:
            return self.block(state, current, target, 'Historique réécrit : la version en place n’est pas un ancêtre')
        files = self.changed_files(current, target)
        reason = self.manual_reason(current, target, files)
        if reason:
            return self.block(state, current, target, reason)
        return self.deploy(state, current, target, files)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--retry', action='store_true', help='retente un commit en échec')
    args = parser.parse_args(argv)
    config = Config(os.environ)
    config.state_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(config.state_dir, 0o755)
    if not shutil.which('git'):
        log('git est introuvable')
        return 2
    with open(config.state_dir / 'lock', 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log('Un déploiement est déjà en cours')
            return 0
        agent = Agent(config)
        if args.retry:
            agent.save_state({})
        outcome = agent.run_once()
    return 1 if outcome in ('rolled_back', 'broken') else 0


if __name__ == '__main__':
    sys.exit(main())
