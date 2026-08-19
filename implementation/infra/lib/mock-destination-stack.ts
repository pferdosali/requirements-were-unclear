import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Mock Destination Stack
 *
 * Deploys TWO Lambda-backed API Gateway endpoints simulating external
 * document receivers in different regions:
 *   - region-a: US Clinical Ops destination
 *   - region-b: EU Clinical Ops destination
 *
 * Each Lambda saves received files to the S3 blob bucket under
 * destinations/{region}/delivered/{filename} for demo visibility.
 */
export class MockDestinationStack extends cdk.Stack {
  public readonly regionAEndpoint: string;
  public readonly regionBEndpoint: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const code = lambda.Code.fromAsset(path.join(__dirname, '../../mock-destination/dist'));

    // Reference the blob bucket for file storage
    const blobBucket = s3.Bucket.fromBucketName(
      this,
      'BlobBucketRef',
      'docbridge-storage-blobstorageaeabf72d-zg6r3qbw734z',
    );

    // --- Region A: US Clinical Ops ---
    const regionAFn = new lambda.Function(this, 'MockDestinationRegionA', {
      functionName: 'docbridge-mock-destination-region-a',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DESTINATION_REGION: 'region-a',
        DESTINATION_NAME: 'US Clinical Ops',
        DESTINATION_BUCKET: blobBucket.bucketName,
      },
    });
    blobBucket.grantWrite(regionAFn);

    const regionAApi = new apigw.RestApi(this, 'MockDestinationApiRegionA', {
      restApiName: 'docbridge-mock-destination-region-a',
      description: 'Mock destination for region-a (US Clinical Ops)',
      binaryMediaTypes: ['application/octet-stream', '*/*'],
    });

    const regionAUpload = regionAApi.root.addResource('upload');
    regionAUpload.addMethod('POST', new apigw.LambdaIntegration(regionAFn));

    this.regionAEndpoint = regionAApi.url + 'upload';

    new cdk.CfnOutput(this, 'MockDestinationRegionAEndpoint', {
      value: this.regionAEndpoint,
      description: 'URL for region-a mock destination',
    });

    // --- Region B: EU Clinical Ops ---
    const regionBFn = new lambda.Function(this, 'MockDestinationRegionB', {
      functionName: 'docbridge-mock-destination-region-b',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DESTINATION_REGION: 'region-b',
        DESTINATION_NAME: 'EU Clinical Ops',
        DESTINATION_BUCKET: blobBucket.bucketName,
      },
    });
    blobBucket.grantWrite(regionBFn);

    const regionBApi = new apigw.RestApi(this, 'MockDestinationApiRegionB', {
      restApiName: 'docbridge-mock-destination-region-b',
      description: 'Mock destination for region-b (EU Clinical Ops)',
      binaryMediaTypes: ['application/octet-stream', '*/*'],
    });

    const regionBUpload = regionBApi.root.addResource('upload');
    regionBUpload.addMethod('POST', new apigw.LambdaIntegration(regionBFn));

    this.regionBEndpoint = regionBApi.url + 'upload';

    new cdk.CfnOutput(this, 'MockDestinationRegionBEndpoint', {
      value: this.regionBEndpoint,
      description: 'URL for region-b mock destination',
    });

    // --- Region C: AP-Southeast Ops ---
    const regionCFn = new lambda.Function(this, 'MockDestinationRegionC', {
      functionName: 'docbridge-mock-destination-region-c',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DESTINATION_REGION: 'region-c',
        DESTINATION_NAME: 'AP-Southeast Ops',
        DESTINATION_BUCKET: blobBucket.bucketName,
      },
    });
    blobBucket.grantWrite(regionCFn);

    const regionCApi = new apigw.RestApi(this, 'MockDestinationApiRegionC', {
      restApiName: 'docbridge-mock-destination-region-c',
      description: 'Mock destination for region-c (AP-Southeast Ops)',
      binaryMediaTypes: ['application/octet-stream', '*/*'],
    });

    const regionCUpload = regionCApi.root.addResource('upload');
    regionCUpload.addMethod('POST', new apigw.LambdaIntegration(regionCFn));

    new cdk.CfnOutput(this, 'MockDestinationRegionCEndpoint', {
      value: regionCApi.url + 'upload',
      description: 'URL for region-c mock destination',
    });
  }
}
