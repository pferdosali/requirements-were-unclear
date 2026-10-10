import { resourceName } from './environment';
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export class MessagingStack extends cdk.Stack {
  public readonly jobQueue: sqs.Queue;
  public readonly taskQueue: sqs.Queue;
  public readonly fanoutTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const jobDlq = new sqs.Queue(this, 'JobDLQ', {
      queueName: resourceName(this, 'docbridge-job-dlq'),
      retentionPeriod: cdk.Duration.days(14),
    });

    this.jobQueue = new sqs.Queue(this, 'JobQueue', {
      queueName: resourceName(this, 'docbridge-job-queue'),
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: { queue: jobDlq, maxReceiveCount: 3 },
    });

    const taskDlq = new sqs.Queue(this, 'TaskDLQ', {
      queueName: resourceName(this, 'docbridge-task-dlq'),
      retentionPeriod: cdk.Duration.days(14),
    });

    this.taskQueue = new sqs.Queue(this, 'TaskQueue', {
      queueName: resourceName(this, 'docbridge-task-queue'),
      visibilityTimeout: cdk.Duration.seconds(600),
      deadLetterQueue: { queue: taskDlq, maxReceiveCount: 4 },
    });

    this.fanoutTopic = new sns.Topic(this, 'TaskFanout', {
      topicName: resourceName(this, 'docbridge-task-fanout'),
    });

    this.fanoutTopic.addSubscription(new subs.SqsSubscription(this.taskQueue));
  }
}
