"""Tests de l'agent de déploiement sur de vrais dépôts Git temporaires.

La CI de GitHub, systemd et les contrôles HTTP sont simulés.
Lancement : python3 -m unittest discover -s ops/gcp/cd -v
"""

import json
import os
import stat
import subprocess
import tempfile
import unittest
import urllib.error
from pathlib import Path

import chatisen_deploy as cd

GOOD_RUN = {'name': 'Builds, tests et configuration Compose', 'status': 'completed',
            'conclusion': 'success', 'app': {'slug': 'github-actions'}}


def git(cwd, *args):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.test',
           'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.test',
           'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_SYSTEM': os.devnull}
    return subprocess.run(['git', '-C', str(cwd), *args], check=True, capture_output=True,
                          text=True, env=env).stdout.strip()


class FakeAgent(cd.Agent):
    def __init__(self, config, world):
        super().__init__(config, clock=lambda: world['now'])
        self.world = world

    def fetch_check_runs(self, sha):
        self.world['api_calls'] += 1
        if self.world['api_error']:
            raise urllib.error.URLError('limite atteinte')
        return self.world['runs']

    def restart_service(self):
        self.world['restarts'].append(self.git('rev-parse', 'HEAD'))

    def probe(self):
        return self.git('rev-parse', 'HEAD') not in self.world['unhealthy']

    def pause(self, seconds):
        pass


class DeployTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.origin = root / 'origin'
        self.origin.mkdir()
        git(self.origin, 'init', '--quiet', '--initial-branch=main')
        self.first = self.commit({
            'package.json': json.dumps({'dependencies': {'web-push': '3.6.7'}}),
            'apps/standalone/server.mjs': 'v1',
            'docs/guide.md': 'v1',
            'ops/gcp/Caddyfile.template': 'v1',
        })
        self.repo = root / 'app'
        git(root, 'clone', '--quiet', str(self.origin), str(self.repo))
        git(self.repo, 'checkout', '--quiet', '--detach', self.first)
        data = root / 'data.json'
        data.write_text('{"users": []}')
        self.config = cd.Config({
            'CHATISEN_CD_REPO_DIR': str(self.repo),
            'CHATISEN_CD_STATE_DIR': str(root / 'state'),
            'CHATISEN_CD_BACKUP_DIR': str(root / 'backups'),
            'CHATISEN_CD_DATA_FILE': str(data),
            'CHATISEN_CD_PAUSE_FILE': str(root / 'pause'),
        })
        self.world = {'now': 1000.0, 'runs': [GOOD_RUN], 'api_calls': 0, 'api_error': False,
                      'restarts': [], 'unhealthy': set()}

    def commit(self, files):
        for name, content in files.items():
            path = self.origin / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        git(self.origin, 'add', '-A')
        git(self.origin, 'commit', '--quiet', '-m', 'c')
        return git(self.origin, 'rev-parse', 'HEAD')

    def run_agent(self):
        return FakeAgent(self.config, self.world).run_once()

    def head(self):
        return git(self.repo, 'rev-parse', 'HEAD')

    def version(self):
        return json.loads((self.config.state_dir / 'public' / 'version.json').read_text())

    def backups(self):
        return sorted(self.config.backup_dir.glob('*.json'))

    def test_up_to_date_publishes_version_without_calling_github(self):
        self.assertEqual(self.run_agent(), 'up_to_date')
        self.assertEqual((self.version()['commit'], self.version()['status']), (self.first, 'deployed'))
        self.assertEqual(self.world['api_calls'], 0)

    def test_documentation_change_deploys_without_restart_or_backup(self):
        target = self.commit({'docs/guide.md': 'v2'})
        self.assertEqual(self.run_agent(), 'deployed')
        self.assertEqual(self.head(), target)
        self.assertEqual((self.world['restarts'], self.backups()), ([], []))
        self.assertEqual((self.version()['commit'], self.version()['status']), (target, 'deployed'))

    def test_application_change_backs_up_data_then_restarts(self):
        target = self.commit({'apps/standalone/server.mjs': 'v2'})
        self.assertEqual(self.run_agent(), 'deployed')
        self.assertEqual(self.world['restarts'], [target])
        self.assertEqual(len(self.backups()), 1)
        self.assertEqual(stat.S_IMODE(self.backups()[0].stat().st_mode), 0o600)

    def test_only_ten_backups_are_kept(self):
        for number in range(13):
            self.commit({'apps/standalone/server.mjs': f'build {number}'})
            self.assertEqual(self.run_agent(), 'deployed')
        self.assertEqual(len(self.backups()), cd.BACKUPS_KEPT)

    def test_unreadable_data_file_cancels_the_deployment(self):
        self.config.data_file.write_text('{"users": [')
        self.commit({'apps/standalone/server.mjs': 'v2'})
        with self.assertRaises(RuntimeError):
            self.run_agent()
        self.assertEqual((self.head(), self.world['restarts']), (self.first, []))

    def test_waits_while_ci_is_running_and_spaces_api_calls(self):
        self.commit({'docs/guide.md': 'v2'})
        self.world['runs'] = [{**GOOD_RUN, 'status': 'in_progress', 'conclusion': None}]
        self.assertEqual(self.run_agent(), 'waiting')
        self.assertEqual(self.run_agent(), 'waiting')
        self.assertEqual((self.world['api_calls'], self.head()), (1, self.first))
        self.world['now'] += 60
        self.world['runs'] = [GOOD_RUN]
        self.assertEqual(self.run_agent(), 'deployed')

    def test_no_check_or_foreign_check_never_deploys(self):
        self.commit({'docs/guide.md': 'v2'})
        for runs in ([], [{**GOOD_RUN, 'app': {'slug': 'autre-app'}}], [{**GOOD_RUN, 'name': 'autre'}]):
            self.world['runs'] = runs
            self.world['now'] += 600
            self.assertEqual(self.run_agent(), 'waiting')
        self.assertEqual(self.head(), self.first)

    def test_api_error_never_deploys(self):
        self.commit({'docs/guide.md': 'v2'})
        self.world['api_error'] = True
        self.assertEqual(self.run_agent(), 'waiting')
        self.assertEqual(self.head(), self.first)

    def test_failed_ci_blocks_then_a_successful_rerun_deploys(self):
        target = self.commit({'docs/guide.md': 'v2'})
        self.world['runs'] = [{**GOOD_RUN, 'conclusion': 'failure'}]
        self.assertEqual(self.run_agent(), 'blocked')
        self.assertEqual((self.head(), self.version()['target']), (self.first, target))
        self.world['now'] += 100
        self.assertEqual(self.run_agent(), 'waiting')
        self.assertEqual(self.world['api_calls'], 1)
        self.world['now'] += 300
        self.world['runs'] = [GOOD_RUN]
        self.assertEqual(self.run_agent(), 'deployed')

    def test_unhealthy_release_is_rolled_back_and_not_retried(self):
        target = self.commit({'apps/standalone/server.mjs': 'cassé'})
        self.world['unhealthy'] = {target}
        self.assertEqual(self.run_agent(), 'rolled_back')
        self.assertEqual(self.head(), self.first)
        self.assertEqual(self.world['restarts'], [target, self.first])
        version = self.version()
        self.assertEqual((version['commit'], version['status'], version['target']),
                         (self.first, 'rolled_back', target))
        self.assertEqual(self.run_agent(), 'already_failed')
        self.assertEqual(self.head(), self.first)

    def test_fix_pushed_after_a_rollback_is_deployed(self):
        broken = self.commit({'apps/standalone/server.mjs': 'cassé'})
        self.world['unhealthy'] = {broken}
        self.run_agent()
        fixed = self.commit({'apps/standalone/server.mjs': 'réparé'})
        self.assertEqual(self.run_agent(), 'deployed')
        self.assertEqual(self.head(), fixed)

    def test_broken_even_after_rollback_is_reported(self):
        target = self.commit({'apps/standalone/server.mjs': 'v2'})
        self.world['unhealthy'] = {target, self.first}
        self.assertEqual(self.run_agent(), 'broken')
        self.assertEqual(self.version()['status'], 'broken')

    def test_system_configuration_change_requires_manual_install(self):
        self.commit({'ops/gcp/Caddyfile.template': 'v2'})
        self.assertEqual(self.run_agent(), 'blocked')
        self.assertEqual(self.head(), self.first)
        self.assertIn('Caddyfile', self.version()['reason'])

    def test_manual_install_is_then_reported_as_deployed(self):
        target = self.commit({'ops/gcp/Caddyfile.template': 'v2'})
        self.run_agent()
        git(self.repo, 'fetch', '--quiet', 'origin', 'main')
        git(self.repo, 'checkout', '--quiet', '--detach', target)
        self.assertEqual(self.run_agent(), 'up_to_date')
        self.assertEqual((self.version()['commit'], self.version()['status']), (target, 'deployed'))

    def test_production_dependency_change_requires_manual_install(self):
        self.commit({'package.json': json.dumps({'dependencies': {'web-push': '3.7.0'}})})
        self.assertEqual(self.run_agent(), 'blocked')
        self.assertEqual(self.head(), self.first)

    def test_package_script_change_deploys(self):
        self.commit({'package.json': json.dumps(
            {'scripts': {'x': 'y'}, 'dependencies': {'web-push': '3.6.7'}})})
        self.assertEqual(self.run_agent(), 'deployed')

    def test_local_modification_blocks(self):
        self.commit({'docs/guide.md': 'v2'})
        (self.repo / 'docs/guide.md').write_text('modifié à la main')
        self.assertEqual(self.run_agent(), 'blocked')
        self.assertEqual((self.repo / 'docs/guide.md').read_text(), 'modifié à la main')

    def test_rewritten_history_blocks(self):
        second = self.commit({'docs/guide.md': 'v2'})
        self.assertEqual(self.run_agent(), 'deployed')
        git(self.origin, 'reset', '--quiet', '--hard', self.first)
        self.commit({'docs/guide.md': 'autre histoire'})
        self.assertEqual(self.run_agent(), 'blocked')
        self.assertEqual(self.head(), second)

    def test_pause_file_stops_everything(self):
        self.commit({'docs/guide.md': 'v2'})
        self.config.pause_file.write_text('')
        self.assertEqual(self.run_agent(), 'paused')
        self.assertEqual((self.head(), self.world['api_calls']), (self.first, 0))

    def test_interrupted_deployment_is_finished_or_rolled_back(self):
        target = self.commit({'apps/standalone/server.mjs': 'v2'})
        git(self.repo, 'fetch', '--quiet', 'origin', 'main')
        git(self.repo, 'checkout', '--quiet', '--detach', target)
        cd.write_json(self.config.state_dir / 'state.json',
                      {'in_progress': {'from': self.first, 'to': target, 'restart': True}}, 0o600)
        self.world['unhealthy'] = {target}
        self.assertEqual(self.run_agent(), 'rolled_back')
        self.assertEqual(self.head(), self.first)


if __name__ == '__main__':
    unittest.main()
