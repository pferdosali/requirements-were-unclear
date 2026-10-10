import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('seed', Path(__file__).parents[1] / 'seed-staging.py')
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class SeedCredentialsTest(unittest.TestCase):
    def test_secret_file_is_private_and_removed_even_when_cli_fails(self):
        for returncode in [0, 1]:
            captured = []
            def invoke(argv, **kwargs):
                path = Path(argv[-1].removeprefix('file://'))
                captured.append(path)
                payload = json.loads(path.read_text())
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                self.assertNotIn(payload['TemporaryPassword'], argv)
                self.assertEqual(payload['TemporaryPassword'], '-temporary-test-valueaA1!')
                self.assertEqual(payload['MessageAction'], 'SUPPRESS')
                from types import SimpleNamespace
                return SimpleNamespace(returncode=returncode, stderr='CLI failure')
            with tempfile.TemporaryDirectory() as directory, patch.object(seed, 'ROOT', Path(directory)), patch.object(seed.secrets, 'token_urlsafe', return_value='-temporary-test-value'), patch.object(seed.subprocess, 'run', side_effect=invoke):
                if returncode:
                    with self.assertRaises(RuntimeError):
                        seed.create_demo_user('staging-pool', 'user-1', 'demo@example.invalid')
                else:
                    seed.create_demo_user('staging-pool', 'user-1', 'demo@example.invalid')
                self.assertFalse(captured[0].exists())
