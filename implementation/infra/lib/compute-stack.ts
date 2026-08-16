import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  apiServiceSg: ec2.SecurityGroup;
  workerServiceSg: ec2.SecurityGroup;
  dbEndpointAddress: string;
  dbEndpointPort: string;
  dbSecret: secretsmanager.ISecret;
  blobBucket: s3.IBucket;
  jobQueue: sqs.IQueue;
  taskQueue: sqs.IQueue;
  routingTable: dynamodb.ITable;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly fargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.cluster = new ecs.Cluster(this, 'DocBridgeCluster', {
      vpc: props.vpc,
      clusterName: 'docbridge',
    });

    // Shared ECR image — different entrypoints for API vs Worker
    const repository = ecr.Repository.fromRepositoryName(this, 'DocBridgeRepo', 'docbridge');
    const image = ecs.ContainerImage.fromEcrRepository(repository, 'latest');

    // Shared environment variables
    const sharedEnv = {
      DB_HOST: props.dbEndpointAddress,
      DB_PORT: props.dbEndpointPort,
      BUCKET_NAME: props.blobBucket.bucketName,
      TASK_QUEUE_URL: props.taskQueue.queueUrl,
      ROUTING_TABLE: props.routingTable.tableName,
      NODE_ENV: 'production',
      AWS_REGION: 'us-east-1',
    };

    // --- API Service ---
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    apiTaskDef.addContainer('api', {
      image,
      command: ['node', 'dist/startup.js'],
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'docbridge-api',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        ...sharedEnv,
        JOB_QUEUE_URL: props.jobQueue.queueUrl,
        PORT: '3000',
      },
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        DB_NAME: ecs.Secret.fromSecretsManager(props.dbSecret, 'dbname'),
      },
      healthCheck: {
        command: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:3000/health'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(15),
      },
    });

    this.fargateService = new ecs.FargateService(this, 'ApiService', {
      cluster: this.cluster,
      taskDefinition: apiTaskDef,
      desiredCount: 1,
      securityGroups: [props.apiServiceSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
    });

    props.blobBucket.grantReadWrite(apiTaskDef.taskRole);
    props.jobQueue.grantSendMessages(apiTaskDef.taskRole);
    props.taskQueue.grantSendMessages(apiTaskDef.taskRole);
    props.routingTable.grantReadData(apiTaskDef.taskRole);

    // --- Task Worker Service ---
    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    workerTaskDef.addContainer('worker', {
      image,
      command: ['node', 'dist/worker/worker.js'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'docbridge-worker',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        ...sharedEnv,
      },
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        DB_NAME: ecs.Secret.fromSecretsManager(props.dbSecret, 'dbname'),
      },
    });

    new ecs.FargateService(this, 'WorkerService', {
      cluster: this.cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      securityGroups: [props.workerServiceSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
    });

    props.blobBucket.grantRead(workerTaskDef.taskRole);
    props.taskQueue.grantConsumeMessages(workerTaskDef.taskRole);
    props.routingTable.grantReadData(workerTaskDef.taskRole);
  }
}
