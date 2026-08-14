# Infrastructure (AWS CDK, TypeScript)

Five stacks, all pinned to `us-east-1` (project decision; also required for a CLOUDFRONT-scope
WAF):

| Stack                        | Contents                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mp3AnalyzerNetworkStack`    | VPC across 2 AZs, public + private subnets, 2 NAT gateways, flow logs                                                                                                                                                                                         |
| `Mp3AnalyzerRepositoryStack` | ECR repo `mp3-frame-analyzer` — scan-on-push, immutable tags, keep-10 lifecycle                                                                                                                                                                               |
| `Mp3AnalyzerServiceStack`    | ECS Fargate (ARM64, 0.5 vCPU/1 GB, non-root, read-only fs), 2–10 tasks autoscaled on CPU + request count, ALB (SG restricted to the CloudFront origin-facing prefix list, 120 s idle timeout for slow uploads), origin-verify secret, alarms → SNS, dashboard |
| `Mp3AnalyzerEdgeStack`       | CloudFront distribution (default domain) + WAF: AWS managed Common rules with **`SizeRestrictions_BODY` overridden to Count** (mandatory — it blocks bodies > 8 KB), KnownBadInputs, IP reputation, 300 req/5 min/IP rate limit                               |
| `Mp3AnalyzerCiCdStack`       | GitHub OIDC provider + `Mp3AnalyzerGithubDeployRole` trusted only by `main` of the configured repo                                                                                                                                                            |

The origin-verify secret never appears in plaintext: the container receives it through native ECS
secret injection, and the CloudFront custom header synthesizes to a CloudFormation dynamic
reference (`{{resolve:secretsmanager:…}}`).

## Deploy

Prerequisites: admin-capable AWS credentials, Docker, `cdk bootstrap aws://<account>/us-east-1`
(account maintenance — MFA, identities — is explicitly out of scope for this phase).

```bash
cd infra && npm ci

# 1. Foundations first (the service references the pushed image)
npx cdk deploy Mp3AnalyzerNetworkStack Mp3AnalyzerRepositoryStack --require-approval never

# 2. Build & push the image (tag = git SHA; task def pins that exact tag)
TAG=$(git rev-parse HEAD)
REPO=<account>.dkr.ecr.us-east-1.amazonaws.com/mp3-frame-analyzer
aws ecr get-login-password | docker login --username AWS --password-stdin "$REPO"
docker build -t "$REPO:$TAG" .. && docker push "$REPO:$TAG"

# 3. Everything else
npx cdk deploy --all --require-approval never \
  -c imageTag="$TAG" -c alertEmail=you@example.com -c githubRepo=owner/repo

# 4. Smoke test
DOMAIN=$(aws cloudformation describe-stacks --stack-name Mp3AnalyzerEdgeStack \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text)
curl -F "file=@../test/fixtures/sample.mp3" "https://$DOMAIN/file-upload"   # {"frameCount":6090}
```

CI/CD: `.github/workflows/deploy.yml` does steps 2–4 on every push to `main`, authenticating via
OIDC against the role from `Mp3AnalyzerCiCdStack` (set repo variables `AWS_ACCOUNT_ID` and
`AWS_DEPLOY_ROLE_ARN`).

## Teardown

```bash
npx cdk destroy --all
```

ECR empties itself on delete; log groups are DESTROY-policy. Rough steady-state cost while up:
2 NAT gateways ~$65/mo + ALB ~$17/mo + 2 Fargate ARM tasks ~$18/mo + CloudFront/WAF ~$10/mo.
