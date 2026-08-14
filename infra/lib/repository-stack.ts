import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';

export class RepositoryStack extends cdk.Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: 'mp3-frame-analyzer',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE, // deploys reference exact SHAs
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true, // demo stack: cdk destroy must leave nothing behind
    });

    new cdk.CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
  }
}
