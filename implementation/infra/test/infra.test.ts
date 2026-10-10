import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MessagingStack } from '../lib/messaging-stack';
import { AuthStack } from '../lib/auth-stack';
import { RoutingStack } from '../lib/routing-stack';

for (const environment of ['production', 'staging']) {
  test(`${environment} has isolated names, preserving existing production names`, () => {
    const app = new cdk.App({ context: { environment } });
    const suffix = environment === 'staging' ? '-staging' : '';
    const messagingStack = new MessagingStack(app, 'Messaging');
    const authStack = new AuthStack(app, 'Auth');
    const routingStack = new RoutingStack(app, 'Routing');
    const messaging = Template.fromStack(messagingStack);
    messaging.hasResourceProperties('AWS::SQS::Queue', { QueueName: `docbridge-task-queue${suffix}` });
    messaging.hasResourceProperties('AWS::SQS::Queue', { QueueName: `docbridge-job-queue${suffix}` });
    Template.fromStack(authStack).hasResourceProperties('AWS::Cognito::UserPool', { UserPoolName: `docbridge-users${suffix}` });
    Template.fromStack(routingStack).hasResourceProperties('AWS::DynamoDB::Table', { TableName: `docbridge-routing-config${suffix}` });
  });
}
