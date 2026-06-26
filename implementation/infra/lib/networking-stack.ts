import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly apiServiceSg: ec2.SecurityGroup;
  public readonly workerServiceSg: ec2.SecurityGroup;
  public readonly albSg: ec2.SecurityGroup;
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'DocBridgeVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { cidrMask: 24, name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { cidrMask: 24, name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    this.apiServiceSg = new ec2.SecurityGroup(this, 'ApiServiceSg', {
      vpc: this.vpc,
      description: 'Security group for API Fargate service',
    });

    this.workerServiceSg = new ec2.SecurityGroup(this, 'WorkerServiceSg', {
      vpc: this.vpc,
      description: 'Security group for Worker Fargate service',
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');

    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'Security group for RDS PostgreSQL',
    });

    // Allow API and Worker to access RDS
    this.dbSg.addIngressRule(this.apiServiceSg, ec2.Port.tcp(5432), 'API access to RDS');
    this.dbSg.addIngressRule(this.workerServiceSg, ec2.Port.tcp(5432), 'Worker access to RDS');
  }
}
