import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Template } from 'aws-cdk-lib/assertions';
import { runInNewContext } from 'node:vm';
import { NetworkingStack } from '../lib/networking-stack';
import { EdgeStack } from '../lib/edge-stack';

test('SPA navigation works without converting API errors into successful HTML responses', () => {
  const app = new cdk.App();
  const network = new NetworkingStack(app, 'Network');
  const compute = new cdk.Stack(app, 'Compute');
  const cluster = new ecs.Cluster(compute, 'Cluster', { vpc: network.vpc });
  const task = new ecs.FargateTaskDefinition(compute, 'Task');
  task.addContainer('api', { image: ecs.ContainerImage.fromRegistry('node:22-alpine'), portMappings: [{ containerPort: 3000 }] });
  const service = new ecs.FargateService(compute, 'Service', { cluster, taskDefinition: task });
  const edge = new EdgeStack(app, 'Edge', { vpc: network.vpc, albSg: network.albSg, fargateService: service });
  const template = Template.fromStack(edge);
  const distribution = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0].Properties.DistributionConfig;
  expect(distribution.CustomErrorResponses).toBeUndefined();
  expect(distribution.DefaultCacheBehavior.FunctionAssociations[0].EventType).toBe('viewer-request');
  const api = distribution.CacheBehaviors.find((behavior: { PathPattern: string }) => behavior.PathPattern === '/api/*');
  expect(api.FunctionAssociations).toBeUndefined();
  const code = Object.values(template.findResources('AWS::CloudFront::Function'))[0].Properties.FunctionCode;
  for (const [uri, expected] of [['/jobs/example', '/index.html'], ['/settings/', '/index.html'], ['/assets/app.js', '/assets/app.js'], ['/config.js', '/config.js'], ['/api/jobs', '/api/jobs']]) {
    expect(runInNewContext(code + `;handler({request:{uri:${JSON.stringify(uri)}}}).uri`)).toBe(expected);
  }
});
