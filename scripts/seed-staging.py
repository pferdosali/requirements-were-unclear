#!/usr/bin/env python3
"""Seed only isolated staging routing and suppressed demo-user records."""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
REGION = 'us-east-1'


def aws(*args):
    output = subprocess.check_output(['aws', '--region', REGION, '--output', 'json', *args], text=True)
    return json.loads(output) if output.strip() else {}


def resources(stack):
    return aws('cloudformation', 'describe-stack-resources', '--stack-name', stack)['StackResources']


def seed(origin):
    if aws('sts', 'get-caller-identity')['Account'] != '930330383608':
        raise ValueError('Unexpected AWS account')
    outputs = {o['OutputKey']: o['OutputValue'] for o in aws('cloudformation', 'describe-stacks', '--stack-name', 'DocBridge-Staging-Edge')['Stacks'][0]['Outputs']}
    if origin != outputs['FrontendUrl']:
        raise ValueError('Origin must equal the staging Edge output')
    table = next(r['PhysicalResourceId'] for r in resources('DocBridge-Staging-Routing') if r['ResourceType'] == 'AWS::DynamoDB::Table')
    if table != 'docbridge-routing-config-staging':
        raise ValueError('Refusing to seed a non-staging routing table')
    mock = {o['OutputKey']: o['OutputValue'] for o in aws('cloudformation', 'describe-stacks', '--stack-name', 'DocBridge-Staging-MockDestination')['Stacks'][0]['Outputs']}
    count = 0
    for user, region, team, output in [('user-1', 'region-a', 'team-a', 'MockDestinationRegionAEndpoint'),
                                        ('user-2', 'region-b', 'team-b', 'MockDestinationRegionBEndpoint'),
                                        ('user-4', 'region-c', 'team-c', 'MockDestinationRegionCEndpoint')]:
        with urlopen(Request(origin + '/api/destinations', headers={'x-user-id': user}), timeout=30) as response:
            tree = json.load(response)['destinations']
        ids = {region}
        def visit(node):
            ids.add(node['id'])
            for child in node.get('children', []):
                visit(child)
        visit(tree)
        for destination in sorted(ids):
            item = {'destination_region': {'S': destination}, 'tenant_id': {'S': team},
                    'endpoint_url': {'S': mock[output]}, 'auth_type': {'S': 'none'},
                    'destination_name': {'S': f'Staging {region}'}}
            aws('dynamodb', 'put-item', '--table-name', table, '--item', json.dumps(item))
            count += 1
    pool = next(r['PhysicalResourceId'] for r in resources('DocBridge-Staging-Auth') if r['ResourceType'] == 'AWS::Cognito::UserPool')
    app = (ROOT / 'implementation/frontend/src/app/App.tsx').read_text()
    personas = re.findall(r'\{ id: "(user-[1-5])", name: "[^"]*", email: "([^"]+)"', app)
    if len(personas) != 5:
        raise ValueError('Expected five demo persona definitions')
    for user, email in personas:
        existing = subprocess.run(['aws', '--region', REGION, 'cognito-idp', 'admin-get-user', '--user-pool-id', pool, '--username', email], capture_output=True, text=True)
        if existing.returncode == 0:
            continue
        if 'UserNotFoundException' not in existing.stderr:
            raise RuntimeError(existing.stderr)
        # Suppress invitations. Random temporary credentials are not logged or retained.
        aws('cognito-idp', 'admin-create-user', '--user-pool-id', pool, '--username', email,
            '--message-action', 'SUPPRESS', '--temporary-password', secrets.token_urlsafe(24) + 'aA1!',
            '--user-attributes', f'Name=email,Value={email}', 'Name=email_verified,Value=true', f'Name=name,Value=Staging {user}')
    print(f'Seeded {count} staging-only routing entries and five suppressed Cognito demo users.')
    print('Temporary demo credentials are not retained; reset credentials for real SRP testing. Current API acceptance uses mock identity headers.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    args = parser.parse_args()
    seed(args.origin.rstrip('/'))
