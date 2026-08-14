import * as cdk from 'aws-cdk-lib';

import { CiCdStack } from '../lib/cicd-stack.js';
import { EdgeStack } from '../lib/edge-stack.js';
import { NetworkStack } from '../lib/network-stack.js';
import { RepositoryStack } from '../lib/repository-stack.js';
import { ServiceStack } from '../lib/service-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  // us-east-1 by decision — and required anyway for a CLOUDFRONT-scope WAF.
  region: 'us-east-1',
};

// `|| undefined` / `|| default`: CI passes context from repo variables, which
// may be empty strings — treat empty as unset.
const imageTag = (app.node.tryGetContext('imageTag') as string | undefined) || 'latest';
const alertEmail = (app.node.tryGetContext('alertEmail') as string | undefined) || undefined;
const githubRepo =
  (app.node.tryGetContext('githubRepo') as string | undefined) ||
  'adamchensley/mp3-frame-analyzer';

const network = new NetworkStack(app, 'Mp3AnalyzerNetworkStack', { env });
const repository = new RepositoryStack(app, 'Mp3AnalyzerRepositoryStack', { env });

const service = new ServiceStack(app, 'Mp3AnalyzerServiceStack', {
  env,
  vpc: network.vpc,
  repository: repository.repository,
  imageTag,
  alertEmail,
});

new EdgeStack(app, 'Mp3AnalyzerEdgeStack', {
  env,
  loadBalancer: service.loadBalancer,
  originVerifySecret: service.originVerifySecret,
});

new CiCdStack(app, 'Mp3AnalyzerCiCdStack', {
  env,
  repository: repository.repository,
  githubRepo,
});
