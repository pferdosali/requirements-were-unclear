#!/usr/bin/env python3
"""Upload synthetic files through staging and verify regional delivery/ownership.

Uses current mock identity headers. Never run against production.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib import request, error
import uuid


def api(origin, user, path, body=None):
    headers = {'x-user-id': user}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = request.Request(origin + '/api' + path, data=data, headers=headers)
    with request.urlopen(req, timeout=30) as response:
        return json.load(response)


def run(origin, bucket=None, timeout=240):
    if not origin.startswith('https://') or origin == 'https://dk9dmvpe7a2yb.cloudfront.net':
        raise ValueError('A staging HTTPS origin is required; refusing production')
    run_id = str(uuid.uuid4())
    results = []
    for user, region, delivered_path in [
        ('user-1', 'region-a', 'us-east/team-alpha'),
        ('user-2', 'region-b', 'eu-west/team-beta'),
        ('user-4', 'region-c', 'ap-southeast/team-gamma'),
    ]:
        payload = f'DocBridge synthetic staging check {run_id} {region}\n'.encode()
        filename = f'staging-check-{run_id}-{region}.txt'
        checksum = hashlib.sha256(payload).hexdigest()
        presign = api(origin, user, '/upload/presign', {'fileName': filename, 'contentType': 'text/plain', 'fileSizeBytes': len(payload)})
        with request.urlopen(request.Request(presign['uploadUrl'], data=payload, method='PUT', headers={'Content-Type': 'text/plain'}), timeout=30):
            pass
        confirmed = api(origin, user, '/upload/confirm', {'objectKey': presign['objectKey']})
        if not confirmed['confirmed'] or confirmed['size'] != len(payload):
            raise RuntimeError('Upload confirmation does not match synthetic payload')
        created = api(origin, user, '/jobs', {'tasks': [{'fileId': presign['objectKey'], 'destinationId': region, 'checksum': checksum}]})
        job_id = created['job']['job_id']
        api(origin, user, f'/jobs/{job_id}/submit', {})
        deadline = time.monotonic() + timeout
        while True:
            job = api(origin, user, f'/jobs/{job_id}')['job']
            if job['status'] == 'completed':
                break
            if job['status'] in ['failed', 'partial_success'] or time.monotonic() >= deadline:
                raise RuntimeError(f"Staging job {job_id} ended with {job['status']}")
            time.sleep(3)
        other_user = 'user-2' if user == 'user-1' else 'user-1'
        try:
            api(origin, other_user, f'/jobs/{job_id}')
        except error.HTTPError as err:
            if err.code not in [403, 404]:
                raise
        else:
            raise RuntimeError('Another user could read the synthetic job')
        delivered_key = f'destinations/{delivered_path}/delivered/{filename}'
        if bucket:
            with tempfile.TemporaryDirectory() as directory:
                destination = Path(directory) / 'delivered.txt'
                subprocess.run(['aws', 's3api', 'get-object', '--region', 'us-east-1', '--bucket', bucket,
                                '--key', delivered_key, str(destination)], check=True, stdout=subprocess.DEVNULL)
                if destination.read_bytes() != payload:
                    raise RuntimeError('Delivered content differs from uploaded content')
        results.append({'userId': user, 'region': region, 'jobId': job_id, 'status': 'completed',
                        'ownershipIsolated': True, 'deliveredContentVerified': bool(bucket)})
        print(f'{region}: upload, checksum, completed job, ownership isolation'+(', delivered bytes verified' if bucket else '')+' passed')
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--bucket', help='Optional staging blob bucket for local delivered-content verification')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    results = run(args.origin.rstrip('/'), args.bucket)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(results, indent=2) + '\n')
