#!/usr/bin/env python3
"""Plan or apply resource-scoped GitHub OIDC roles; never deploy application code."""
import argparse
import json
from pathlib import Path
import subprocess

REPO = 'pferdosali/requirements-were-unclear'
ACCOUNT = '930330383608'
REGION = 'us-east-1'
ROOT = Path(__file__).resolve().parent.parent


def aws(*args):
    output = subprocess.check_output(['aws', '--region', REGION, '--output', 'json', *args], text=True)
    return json.loads(output) if output.strip() else {}


def gh(*args):
    subprocess.run(['gh', *args], check=True, stdout=subprocess.DEVNULL)


def statement(actions, resources, **extra):
    return {'Effect': 'Allow', 'Action': actions, 'Resource': resources, **extra}


def discover(environment):
    if environment == 'build':
        return {'variables': {'AWS_REGION': REGION, 'ECR_REPOSITORY': 'docbridge'}}
    prefix = 'DocBridge-Staging' if environment == 'staging' else 'DocBridge'
    cluster = 'docbridge-staging' if environment == 'staging' else 'docbridge'
    services = aws('ecs', 'list-services', '--cluster', cluster)['serviceArns']
    data = aws('ecs', 'describe-services', '--cluster', cluster, '--services', *services)['services']
    api = next(s for s in data if 'ApiService' in s['serviceName'])
    worker = next(s for s in data if 'WorkerService' in s['serviceName'])
    pass_roles = set()
    for service in [api, worker]:
        task = aws('ecs', 'describe-task-definition', '--task-definition', service['taskDefinition'])['taskDefinition']
        pass_roles.update([task['taskRoleArn'], task['executionRoleArn']])
    edge = aws('cloudformation', 'describe-stack-resources', '--stack-name', f'{prefix}-Edge')['StackResources']
    bucket = next(r['PhysicalResourceId'] for r in edge if r['ResourceType'] == 'AWS::S3::Bucket')
    distribution_id = next(r['PhysicalResourceId'] for r in edge if r['ResourceType'] == 'AWS::CloudFront::Distribution')
    distribution = aws('cloudfront', 'get-distribution', '--id', distribution_id)['Distribution']
    auth = aws('cloudformation', 'describe-stack-resources', '--stack-name', f'{prefix}-Auth')['StackResources']
    pool = next(r['PhysicalResourceId'] for r in auth if r['ResourceType'] == 'AWS::Cognito::UserPool')
    client = next(r['PhysicalResourceId'] for r in auth if r['ResourceType'] == 'AWS::Cognito::UserPoolClient')
    return {'variables': {'AWS_REGION': REGION, 'ECS_CLUSTER': cluster,
                         'API_SERVICE': api['serviceName'], 'WORKER_SERVICE': worker['serviceName'],
                         'FRONTEND_BUCKET': bucket, 'CLOUDFRONT_DISTRIBUTION_ID': distribution_id,
                         'FRONTEND_URL': f"https://{distribution['DomainName']}",
                         'COGNITO_USER_POOL_ID': pool, 'COGNITO_CLIENT_ID': client},
            'serviceArns': [api['serviceArn'], worker['serviceArn']], 'passRoles': sorted(pass_roles)}


def policy_for(environment, inventory):
    if environment == 'build':
        rules = [statement(['ecr:GetAuthorizationToken'], '*'),
                 statement(['ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart',
                            'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:DescribeImages',
                            'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
                           f'arn:aws:ecr:{REGION}:{ACCOUNT}:repository/docbridge')]
    else:
        v = inventory['variables']
        rules = [statement(['ecs:DescribeServices', 'ecs:UpdateService'], inventory['serviceArns']),
                 statement(['ecs:DescribeTaskDefinition', 'ecs:RegisterTaskDefinition'], '*'),
                 statement(['iam:PassRole'], inventory['passRoles'],
                           Condition={'StringEquals': {'iam:PassedToService': 'ecs-tasks.amazonaws.com'}}),
                 statement(['s3:ListBucket'], f"arn:aws:s3:::{v['FRONTEND_BUCKET']}"),
                 statement(['s3:GetObject', 's3:PutObject'], f"arn:aws:s3:::{v['FRONTEND_BUCKET']}/*"),
                 statement(['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
                           f"arn:aws:cloudfront::{ACCOUNT}:distribution/{v['CLOUDFRONT_DISTRIBUTION_ID']}")]
    return {'Version': '2012-10-17', 'Statement': rules}


def trust_for(environment):
    return {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Principal': {'Federated': f'arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com'},
        'Action': 'sts:AssumeRoleWithWebIdentity', 'Condition': {'StringEquals': {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': f'repo:{REPO}:environment:{environment}'}}}]}


def configure(environment, apply):
    inventory = discover(environment)
    role_name = f'docbridge-github-{environment}'
    trust, policy = trust_for(environment), policy_for(environment, inventory)
    state = ROOT / '.local'
    state.mkdir(exist_ok=True)
    for suffix, contents in [('trust', trust), ('policy', policy), ('resources', inventory)]:
        (state / f'{environment}-{suffix}.json').write_text(json.dumps(contents, indent=2) + '\n')
    if not apply:
        print(f'Planned {environment}: exact trust, permissions, and resources saved in .local/')
        return
    lookup = subprocess.run(['aws', 'iam', 'get-role', '--role-name', role_name, '--output', 'json'],
                            capture_output=True, text=True)
    if lookup.returncode == 0:
        role = json.loads(lookup.stdout)['Role']
        tags = {t['Key']: t['Value'] for t in role.get('Tags', [])}
        if tags.get('ManagedBy') != 'DocBridgeCI':
            raise RuntimeError(f'Refusing to replace unmanaged role {role_name}')
        aws('iam', 'update-assume-role-policy', '--role-name', role_name, '--policy-document', json.dumps(trust))
    elif 'NoSuchEntity' in lookup.stderr:
        role = aws('iam', 'create-role', '--role-name', role_name, '--assume-role-policy-document', json.dumps(trust),
                   '--tags', 'Key=ManagedBy,Value=DocBridgeCI', f'Key=Environment,Value={environment}')['Role']
    else:
        raise RuntimeError(lookup.stderr)
    aws('iam', 'put-role-policy', '--role-name', role_name, '--policy-name', 'DeploymentAccess',
        '--policy-document', json.dumps(policy))
    gh('secret', 'set', 'AWS_DEPLOY_ROLE_ARN', '--repo', REPO, '--env', environment, '--body', role['Arn'])
    for key, value in inventory['variables'].items():
        gh('variable', 'set', key, '--repo', REPO, '--env', environment, '--body', value)
    inventory['roleArn'] = role['Arn']
    (state / f'{environment}-resources.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print(f'Configured {environment}: {role["Arn"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', choices=['build', 'staging', 'production'], action='append', required=True)
    parser.add_argument('--apply', action='store_true', help='Create/update IAM roles and GitHub environment settings')
    args = parser.parse_args()
    if aws('sts', 'get-caller-identity')['Account'] != ACCOUNT:
        raise SystemExit('Refusing to configure a different AWS account')
    provider = aws('iam', 'get-open-id-connect-provider', '--open-id-connect-provider-arn',
                   f'arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com')
    if 'sts.amazonaws.com' not in provider['ClientIDList']:
        raise SystemExit('OIDC provider must allow sts.amazonaws.com')
    for target in args.environment:
        configure(target, args.apply)
