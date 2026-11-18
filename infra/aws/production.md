# Abstruck public beta deployment

Use main in [cadornajansen/abstruck-ai](https://github.com/cadornajansen/abstruck-ai) for Vercel project `abstruck-app`, root `apps/web`, Node.js 24, and `ENABLE_EXPERIMENTAL_COREPACK=1`. The public beta uses free study allowances. PayMongo test checkout stays available in local development.

## Production settings

- Use CodeTayo Supabase project `qgdbftgqiinydeeiwadg`. Set the Auth Site URL to `https://app.abstruck.space`. Allow the exact `https://app.abstruck.space/auth/callback` and `http://localhost:3000/auth/callback**` for local callback query parameters. Verify public Google sign-in and the Supabase Auth Resend SMTP sender. [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls)
- In Vercel Production, use the project's URL for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`, with its publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Set `NEXT_PUBLIC_APP_URL=https://app.abstruck.space` and expose Vercel system environment variables.
- Set `R2_ACCOUNT_ID`, `R2_BUCKET`, `EMAIL_FROM`, `SUPPORT_EMAIL`, and `ABSTRUCK_ADMIN_USER_IDS`. Use Sensitive variables for `SUPABASE_SECRET_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `SHARE_TOKEN_SECRET`. Share the AssemblyAI account and webhook secret with the worker through its secret store. [Vercel Sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- Keep the existing private R2 bucket. Add `https://app.abstruck.space` to the existing upload CORS rule. Access to individual files comes through signed URLs. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## Fargate tasks

Use an Abstruck deployment identity in `us-east-1`. Read the live `abstruck-cp01` stack outputs for its cluster, ECR repository, and worker security group. Use public subnets in the same VPC with an Internet Gateway route.

Create two Secrets Manager JSON secrets with the standard AWS-managed key. Enter values in the secret store and supply their ARNs to CloudFormation.

| Secret | JSON keys |
| --- | --- |
| Worker | `SUPABASE_SECRET_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` |
| Backup | `SUPABASE_DB_URL` for the CodeTayo session pooler, `DATABASE_BACKUP_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

Keep the backup key in escrow for restores. From the exact release commit on a Docker builder with ECR access, set `ABSTRUCK_REPOSITORY_URI` and `ABSTRUCK_REPOSITORY_NAME` to the stack outputs.

```bash
set -euo pipefail
release="$(git rev-parse --short=12 HEAD)"
registry="${ABSTRUCK_REPOSITORY_URI%%/*}"
aws ecr get-login-password --region us-east-1 |
  docker login --username AWS --password-stdin "$registry"
for target in runtime backup; do
  tag="${target}-${release}"
  docker build --platform linux/amd64 -f apps/worker/Dockerfile \
    --target "$target" -t "${ABSTRUCK_REPOSITORY_URI}:$tag" .
  docker push "${ABSTRUCK_REPOSITORY_URI}:$tag"
  aws ecr describe-images --region us-east-1 \
    --repository-name "$ABSTRUCK_REPOSITORY_NAME" --image-ids "imageTag=$tag" \
    --query 'imageDetails[0].imageDigest' --output text
done
```

Deploy [production-worker.yaml](production-worker.yaml) as `abstruck-production` with the two digests, secret ARNs, R2 identifiers, and the existing cluster, ECR, VPC and subnet settings. Pass `CAPABILITY_IAM` to CloudFormation. Wait for the worker to stabilize with one running task.

Run the backup task once using the output `BackupTaskArn` and `BackupSecurityGroupId`, the same public subnets, and Fargate platform 1.4.0. In CloudWatch, confirm exit code 0 and `remoteReadbackVerified: true`. Set `BackupScheduleState` to `ENABLED` after this check to run daily at 2 a.m. Manila time. The task previews retention. Operator-approved pruning is separate.

## Cutover

Keep automatic domain assignment off and Git builds paused during setup. When the providers and worker are ready, stage a Production deployment from the verified main commit with its generated URL protected by Vercel Authentication. Check free pricing and 404 preview routes. Promote that build to assign the public domains. [Staging a Vercel production deployment](https://vercel.com/docs/deployments/managing-deployments#staging-and-promoting-a-production-deployment)

Start at [the public landing page](https://www.abstruck.space) in a clean session. Confirm that signup, Google sign-in and password reset stay on [the app](https://app.abstruck.space). Upload one small PDF and one short audio file. After both reach Ready, generate a study set and ask a question with a source citation. If a YouTube link fails, use a file you have permission to upload.

Restore automatic domain assignment and Git-triggered builds from main after the public check. If the first cutover fails, pause builds and restore the marketing domains to the previous working Vercel project with the existing apex redirect.
