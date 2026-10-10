import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('access', Path(__file__).parents[1] / 'configure-deployment-access.py')
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)


class DeploymentAccessTest(unittest.TestCase):
    def test_trust_is_bound_to_each_repository_environment(self):
        for environment in ['build', 'staging', 'production']:
            claim = access.trust_for(environment)['Statement'][0]['Condition']['StringEquals']
            self.assertEqual(claim['token.actions.githubusercontent.com:sub'], f'repo:{access.REPO}:environment:{environment}')
            self.assertEqual(claim['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com')

    def test_application_permissions_do_not_cross_environments(self):
        for environment in ['staging', 'production']:
            prefix = f'arn:aws:ecs:us-east-1:{access.ACCOUNT}:service/{environment}'
            roles = [f'arn:aws:iam::{access.ACCOUNT}:role/{environment}-task']
            inventory = {'variables': {'FRONTEND_BUCKET': f'{environment}-frontend', 'CLOUDFRONT_DISTRIBUTION_ID': environment},
                         'serviceArns': [prefix], 'passRoles': roles}
            rules = access.policy_for(environment, inventory)['Statement']
            self.assertEqual(next(r for r in rules if 'ecs:UpdateService' in r['Action'])['Resource'], [prefix])
            pass_role = next(r for r in rules if 'iam:PassRole' in r['Action'])
            self.assertEqual(pass_role['Resource'], roles)
            self.assertEqual(pass_role['Condition']['StringEquals']['iam:PassedToService'], 'ecs-tasks.amazonaws.com')
            self.assertEqual(next(r for r in rules if 's3:PutObject' in r['Action'])['Resource'], f'arn:aws:s3:::{environment}-frontend/*')
            self.assertFalse(any(a.startswith(('iam:Create', 'iam:Put', 'cloudformation:')) or 'Delete' in a for r in rules for a in r['Action']))

    def test_build_role_only_writes_the_release_repository(self):
        rules = access.policy_for('build', {})['Statement']
        self.assertEqual(next(r for r in rules if 'ecr:PutImage' in r['Action'])['Resource'], f'arn:aws:ecr:us-east-1:{access.ACCOUNT}:repository/docbridge')
        self.assertFalse(any(a.startswith(('ecs:', 'iam:', 's3:', 'cloudformation:')) for r in rules for a in r['Action']))
