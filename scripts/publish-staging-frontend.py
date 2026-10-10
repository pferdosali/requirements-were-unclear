#!/usr/bin/env python3
"""Publish a validated frontend artifact to the isolated staging Edge stack only."""
import argparse
import json
from pathlib import Path
import subprocess


def aws(*args):
    output = subprocess.check_output(['aws', '--region', 'us-east-1', '--output', 'json', *args], text=True)
    return json.loads(output) if output.strip() else {}


def outputs(stack):
    return {o['OutputKey']: o['OutputValue'] for o in aws('cloudformation', 'describe-stacks', '--stack-name', stack)['Stacks'][0]['Outputs']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact-dir', type=Path, required=True)
    args = parser.parse_args()
    if aws('sts', 'get-caller-identity')['Account'] != '930330383608':
        raise SystemExit('Unexpected AWS account')
    if not (args.artifact_dir / 'index.html').is_file():
        raise SystemExit('Validated frontend artifact must include index.html')
    edge, auth = outputs('DocBridge-Staging-Edge'), outputs('DocBridge-Staging-Auth')
    production = aws('cloudformation', 'describe-stack-resources', '--stack-name', 'DocBridge-Edge')['StackResources']
    production_id = next(r['PhysicalResourceId'] for r in production if r['ResourceType'] == 'AWS::CloudFront::Distribution')
    if edge['DistributionId'] == production_id:
        raise SystemExit('Refusing production distribution')
    config = {'userPoolId': auth['UserPoolId'], 'clientId': auth['ClientId']}
    (args.artifact_dir / 'config.js').write_text('window.DOCBRIDGE_CONFIG = ' + json.dumps(config) + ';\n')
    bucket = edge['FrontendBucketName']
    subprocess.run(['aws', 's3', 'sync', str(args.artifact_dir), f's3://{bucket}/', '--exclude', 'index.html', '--exclude', 'config.js', '--cache-control', 'public,max-age=31536000,immutable'], check=True)
    for filename, content_type, cache in [('config.js', 'application/javascript', 'no-store'), ('index.html', 'text/html', 'no-cache')]:
        subprocess.run(['aws', 's3', 'cp', str(args.artifact_dir / filename), f's3://{bucket}/{filename}', '--content-type', content_type, '--cache-control', cache], check=True)
    invalidation = aws('cloudfront', 'create-invalidation', '--distribution-id', edge['DistributionId'], '--paths', '/*')['Invalidation']['Id']
    subprocess.run(['aws', 'cloudfront', 'wait', 'invalidation-completed', '--distribution-id', edge['DistributionId'], '--id', invalidation], check=True)
    print('Published validated frontend artifact to ' + edge['FrontendUrl'])
