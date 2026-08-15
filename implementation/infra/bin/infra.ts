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

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '930330383608',
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const networking = new NetworkingStack(app, 'DocBridge-Networking', { env });

const auth = new AuthStack(app, 'DocBridge-Auth', { env });

const storage = new StorageStack(app, 'DocBridge-Storage', {
  env,
  vpc: networking.vpc,
  dbSecurityGroup: networking.dbSg,
});

const messaging = new MessagingStack(app, 'DocBridge-Messaging', { env });

const routing = new RoutingStack(app, 'DocBridge-Routing', { env });

const compute = new ComputeStack(app, 'DocBridge-Compute', {
  env,
  vpc: networking.vpc,
  apiServiceSg: networking.apiServiceSg,
  workerServiceSg: networking.workerServiceSg,
  dbEndpointAddress: storage.database.dbInstanceEndpointAddress,
  dbEndpointPort: storage.database.dbInstanceEndpointPort,
  blobBucket: storage.blobBucket,
  jobQueue: messaging.jobQueue,
  taskQueue: messaging.taskQueue,
  routingTable: routing.routingTable,
});

new EdgeStack(app, 'DocBridge-Edge', {
  env,
  vpc: networking.vpc,
  albSg: networking.albSg,
  fargateService: compute.fargateService,
});

new MockDestinationStack(app, 'DocBridge-MockDestination', { env });
