import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';

export interface ServiceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  repository: ecr.Repository;
  /** Git SHA of the image to run; pass with -c imageTag=<sha>. */
  imageTag: string;
  /** Optional email for CloudWatch alarms; pass with -c alertEmail=<addr>. */
  alertEmail?: string;
}

export class ServiceStack extends cdk.Stack {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly originVerifySecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    const { vpc, repository, imageTag } = props;

    // Shared secret proving traffic came through CloudFront. The app compares
    // it against the x-origin-verify header CloudFront injects; it reaches the
    // container via native ECS secret injection (never in a template).
    this.originVerifySecret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      description: 'CloudFront -> ALB origin verification header for mp3-frame-analyzer',
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
      // Graviton: cheaper per vCPU, and images build natively on Apple Silicon.
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDefinition.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
      readonlyRootFilesystem: true,
      environment: {
        PORT: '3000',
        MAX_UPLOAD_BYTES: String(500 * 1024 * 1024),
        LOG_LEVEL: 'info',
      },
      secrets: {
        ORIGIN_VERIFY_SECRET: ecs.Secret.fromSecretsManager(this.originVerifySecret),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logGroup: new logs.LogGroup(this, 'ApiLogGroup', {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      portMappings: [{ containerPort: 3000 }],
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      description: 'mp3-frame-analyzer Fargate tasks',
      allowAllOutbound: true,
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2, // spread across both AZs
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });

    const scaling = service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 10 });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.minutes(3),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // ALB reachable only from CloudFront's origin-facing IP ranges (managed
    // prefix list) — combined with the origin-verify header in the app.
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'mp3-frame-analyzer ALB - CloudFront origin-facing ranges only',
      allowAllOutbound: false,
    });
    const cloudFrontOriginFacing = ec2.PrefixList.fromLookup(this, 'CloudFrontOriginFacing', {
      prefixListName: 'com.amazonaws.global.cloudfront.origin-facing',
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(cloudFrontOriginFacing.prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origin-facing',
    );
    albSecurityGroup.connections.allowTo(serviceSecurityGroup, ec2.Port.tcp(3000), 'to tasks');

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      idleTimeout: cdk.Duration.seconds(120), // slow large uploads
    });
    const listener = this.loadBalancer.addListener('Http', { port: 80, open: false });
    const targetGroup = listener.addTargets('Api', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/healthz',
        interval: cdk.Duration.seconds(15),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 100,
      targetGroup,
    });

    // ---- Observability ----
    const alarmTopic = new sns.Topic(this, 'AlarmTopic');
    if (props.alertEmail) {
      alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(props.alertEmail));
    }
    const alarms = [
      new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
        metric: this.loadBalancer.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'ALB returned >=5 5xx responses in 5 minutes',
      }),
      new cloudwatch.Alarm(this, 'UnhealthyHostsAlarm', {
        metric: targetGroup.metrics.unhealthyHostCount({ period: cdk.Duration.minutes(1) }),
        threshold: 1,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'One or more targets unhealthy for 3 minutes',
      }),
      new cloudwatch.Alarm(this, 'CpuAlarm', {
        metric: service.metricCpuUtilization({ period: cdk.Duration.minutes(5) }),
        threshold: 80,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'Service CPU above 80% for 10 minutes',
      }),
    ];
    for (const alarm of alarms) alarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'mp3-frame-analyzer',
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Requests',
            left: [this.loadBalancer.metrics.requestCount()],
          }),
          new cloudwatch.GraphWidget({
            title: 'Target response time p99',
            left: [targetGroup.metrics.targetResponseTime({ statistic: 'p99' })],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: '5xx',
            left: [this.loadBalancer.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT)],
            right: [
              this.loadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT),
            ],
          }),
          new cloudwatch.GraphWidget({
            title: 'Service CPU / Memory',
            left: [service.metricCpuUtilization()],
            right: [service.metricMemoryUtilization()],
          }),
        ],
      ],
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.loadBalancer.loadBalancerDnsName });
  }
}
