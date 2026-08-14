import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';

export interface CiCdStackProps extends cdk.StackProps {
  repository: ecr.Repository;
  /** "owner/repo", pass with -c githubRepo=owner/repo. */
  githubRepo: string;
  /**
   * Exact ID-qualified OIDC subject GitHub now issues, e.g.
   * "repo:owner@1234/repo@5678:ref:refs/heads/main". Look it up with
   * `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`
   * (`sub_claim_prefix`). The trust accepts this OR the classic
   * name-based subject, so either token format can assume the role.
   */
  githubIdQualifiedSubject?: string;
}

/**
 * GitHub Actions deploys via OIDC — no long-lived AWS keys ever exist.
 * The role trusts only pushes to main on the configured repository.
 */
export class CiCdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiCdStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'Mp3AnalyzerGithubDeployRole',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          // Array = OR: exact match on either subject format, main branch only.
          'token.actions.githubusercontent.com:sub': [
            `repo:${props.githubRepo}:ref:refs/heads/main`,
            ...(props.githubIdQualifiedSubject ? [props.githubIdQualifiedSubject] : []),
          ],
        },
      }),
      description: 'GitHub Actions deploy role for mp3-frame-analyzer',
    });

    // Push images to the one repository.
    props.repository.grantPullPush(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }),
    );
    // CDK deploys by assuming the bootstrap roles; CloudFormation reads for the smoke test.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
