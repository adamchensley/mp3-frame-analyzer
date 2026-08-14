import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface EdgeStackProps extends cdk.StackProps {
  loadBalancer: elbv2.ApplicationLoadBalancer;
  originVerifySecret: secretsmanager.Secret;
}

export class EdgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'mp3-frame-analyzer',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedCommon',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              // Load-bearing: the body-inspection rules reject legitimate MP3
              // uploads. SizeRestrictions_BODY blocks any body > 8 KB, and the
              // XSS/LFI/RFI body matchers false-positive on arbitrary binary
              // audio bytes (observed live: CrossSiteScripting_BODY blocked the
              // sample file). Count them; header/URI protections stay active.
              ruleActionOverrides: [
                { name: 'SizeRestrictions_BODY', actionToUse: { count: {} } },
                { name: 'CrossSiteScripting_BODY', actionToUse: { count: {} } },
                { name: 'GenericLFI_BODY', actionToUse: { count: {} } },
                { name: 'GenericRFI_BODY', actionToUse: { count: {} } },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'common-rules',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedKnownBadInputs',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
              // Same binary-body false-positive class as above: random audio
              // bytes can match payload signatures. Body variants to Count.
              ruleActionOverrides: [
                { name: 'JavaDeserializationRCE_BODY', actionToUse: { count: {} } },
                { name: 'Log4JRCE_BODY', actionToUse: { count: {} } },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'known-bad-inputs',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedIpReputation',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-reputation',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitPerIp',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 300, aggregateKeyType: 'IP' }, // per 5 minutes
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'rate-limit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Default CloudFront domain => no ACM cert is possible on the ALB's
    // *.elb.amazonaws.com name, so the CF->ALB hop is HTTP, mitigated by the
    // origin-facing prefix list on the ALB SG plus the origin-verify header
    // (checked in the app; the header value synthesizes to a CloudFormation
    // dynamic reference, not plaintext). Custom domain + ACM upgrades this
    // to end-to-end TLS.
    const origin = new origins.LoadBalancerV2Origin(props.loadBalancer, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      customHeaders: {
        'x-origin-verify': props.originVerifySecret.secretValue.unsafeUnwrap(),
      },
      readTimeout: cdk.Duration.seconds(60),
      connectionAttempts: 2,
    });

    const uploadBehavior: cloudfront.BehaviorOptions = {
      origin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'mp3-frame-analyzer',
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/file-upload': uploadBehavior,
        '/analyze': uploadBehavior,
        '/healthz': uploadBehavior,
      },
    });

    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'PublicUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
