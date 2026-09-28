#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { StorageStack } from '../lib/storage-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { ComputeStack } from '../lib/compute-stack';
import { EdgeStack } from '../lib/edge-stack';
import { AuthStack } from '../lib/auth-stack';
import { RoutingStack } from '../lib/routing-stack';
import { MockDestinationStack } from '../lib/mock-destination-stack';

const app = new cdk.App();

// Environment selection: `cdk ... -c env=dev|prod` (default: dev).
// One AWS account, two isolated environments via env-suffixed stack names (ADR-0011).
const envName = (app.node.tryGetContext('env') || 'dev').toLowerCase();
if (!['dev', 'prod'].includes(envName)) {
  throw new Error(`Invalid env context '${envName}'. Use -c env=dev or -c env=prod.`);
}

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '930330383608',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// All stacks are prefixed per environment: DocBridge-dev-* / DocBridge-prod-*.
const prefix = `DocBridge-${envName}`;

// Tag every resource with its environment for cost/ops visibility.
cdk.Tags.of(app).add('Environment', envName);
cdk.Tags.of(app).add('Project', 'DocBridge');

const networking = new NetworkingStack(app, `${prefix}-Networking`, { env });

const auth = new AuthStack(app, `${prefix}-Auth`, { env, envName });

const storage = new StorageStack(app, `${prefix}-Storage`, {
  env,
  vpc: networking.vpc,
  dbSecurityGroup: networking.dbSg,
});

const messaging = new MessagingStack(app, `${prefix}-Messaging`, { env });

const routing = new RoutingStack(app, `${prefix}-Routing`, { env });

const compute = new ComputeStack(app, `${prefix}-Compute`, {
  env,
  envName,
  vpc: networking.vpc,
  apiServiceSg: networking.apiServiceSg,
  workerServiceSg: networking.workerServiceSg,
  dbEndpointAddress: storage.database.dbInstanceEndpointAddress,
  dbEndpointPort: storage.database.dbInstanceEndpointPort,
  dbSecret: storage.database.secret!,
  blobBucket: storage.blobBucket,
  jobQueue: messaging.jobQueue,
  taskQueue: messaging.taskQueue,
  routingTable: routing.routingTable,
});

new EdgeStack(app, `${prefix}-Edge`, {
  env,
  vpc: networking.vpc,
  albSg: networking.albSg,
  fargateService: compute.fargateService,
});

new MockDestinationStack(app, `${prefix}-MockDestination`, { env });
