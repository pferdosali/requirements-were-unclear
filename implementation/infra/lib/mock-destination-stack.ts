import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Mock Destination Stack
 *
 * Deploys a Lambda behind API Gateway that simulates an external document receiver.
 * All received documents are logged to CloudWatch with structured metadata.
 *
 * Used for:
 * - End-to-end testing of the delivery pipeline
 * - Verifying auth headers, checksums, and payloads
 * - Monitoring delivery attempts via CloudWatch Logs Insights
 */
export class MockDestinationStack extends cdk.Stack {
  public readonly endpoint: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'MockDestinationHandler', {
      functionName: 'docbridge-mock-destination',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../mock-destination')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    const api = new apigw.RestApi(this, 'MockDestinationApi', {
      restApiName: 'docbridge-mock-destination',
      description: 'Mock destination for DocBridge file delivery testing',
      binaryMediaTypes: ['application/octet-stream', '*/*'],
    });

    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(fn));

    this.endpoint = api.url + 'upload';

    new cdk.CfnOutput(this, 'MockDestinationEndpoint', {
      value: this.endpoint,
      description: 'URL for mock destination file upload endpoint',
    });
  }
}
