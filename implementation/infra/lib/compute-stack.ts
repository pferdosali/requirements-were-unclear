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
  blobBucket: s3.IBucket;
  jobQueue: sqs.IQueue;
  taskQueue: sqs.IQueue;
  routingTable: dynamodb.ITable;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly fargateService: ecs.FargateService;
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ECR Repository
    this.repository = new ecr.Repository(this, 'DocBridgeRepo', {
      repositoryName: 'docbridge',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        { maxImageCount: 10, description: 'Keep last 10 images' },
      ],
    });

    this.cluster = new ecs.Cluster(this, 'DocBridgeCluster', {
      vpc: props.vpc,
      clusterName: 'docbridge',
    });

    // DB credentials secret
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: 'docbridge/db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'docbridge' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 24,
      },
    });

    // Common environment variables
    const commonEnv: Record<string, string> = {
      DB_HOST: props.dbEndpointAddress,
      DB_PORT: props.dbEndpointPort,
      DB_NAME: 'docbridge',
      DB_USER: 'docbridge',
      BUCKET_NAME: props.blobBucket.bucketName,
      JOB_QUEUE_URL: props.jobQueue.queueUrl,
      TASK_QUEUE_URL: props.taskQueue.queueUrl,
      ROUTING_TABLE: props.routingTable.tableName,
      AWS_REGION: cdk.Stack.of(this).region,
      LOG_LEVEL: 'info',
    };

    // API Service
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    apiTaskDef.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'docbridge-api',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: { ...commonEnv, SERVICE_NAME: 'docbridge-api' },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
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
    dbSecret.grantRead(apiTaskDef.taskRole);

    // Task Worker Service
    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    workerTaskDef.addContainer('worker', {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      command: ['node', 'dist/worker/worker.js'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'docbridge-worker',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: { ...commonEnv, SERVICE_NAME: 'docbridge-worker' },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
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
    dbSecret.grantRead(workerTaskDef.taskRole);

    // Outputs
    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI for Docker push',
    });
  }
}
