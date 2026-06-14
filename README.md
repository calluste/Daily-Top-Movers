# Daily Top Movers — Serverless Stocks Pipeline

A fully automated, serverless pipeline on AWS that wakes up every weekday, finds the single biggest mover (by absolute % change) from a watchlist of six tech stocks, records it, and serves the last 7 days of winners on a public website.

**Watchlist:** AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA

## Live Demo

- **Frontend:** http://stocks-pipeline-frontend-957667616828.s3-website-us-east-1.amazonaws.com
- **API:** https://vmvp0gbqy9.execute-api.us-east-1.amazonaws.com/movers

> Note: the frontend is served over HTTP (S3 static website hosting). See [Trade-offs](#trade-offs--decisions).

## Architecture

```
EventBridge (cron, weekdays 22:30 UTC)
      │
      ▼
Ingestion Lambda (TypeScript) ──► Massive API (1 grouped call → whole market)
      │
      ▼
  DynamoDB  (table: daily-movers)
      ▲
      │  Query (last 7 days)
API Lambda (TypeScript) ◄── API Gateway (HTTP API) ◄── GET /movers
                                                          ▲
                              React + Vite SPA on S3 ─────┘
```

### Key design decisions

- **One API call for the whole market.** The Massive free tier allows 5 calls/minute, but rather than looping the 6 tickers, the ingestion Lambda hits the *grouped daily bars* endpoint once, retrieving the entire US market in a single request, then filters to the watchlist locally. This keeps usage well under the rate limit. Exponential-backoff retries (1s/2s/4s) are implemented as a defensive layer for transient failures and 429s.
- **Single-table DynamoDB access pattern.** Items use a constant partition key `PK = "MOVER"` and the ISO date as the sort key `SK`. "Last 7 days" is therefore a single efficient `Query` (sorted descending, limit 7) — never a full table `Scan`.
- **Separation of concerns.** Ingestion (cron-triggered write) and retrieval (API-triggered read) are two independent Lambdas with separate, least-privilege IAM roles: the ingestion role can only `PutItem` + read the API-key secret; the API role can only `Query`.
- **Secrets stay out of code.** The Massive API key lives in AWS Secrets Manager, injected into Terraform via an environment variable, never committed.

## Project Structure

```
Daily-Top-Movers/
├── .github/workflows/
│   └── deploy.yml          # CI/CD: build + deploy on push to main (OIDC auth)
├── backend/
│   ├── src/ingest/handler.ts   # ingestion Lambda (cron)
│   ├── src/api/handler.ts      # API Lambda (GET /movers)
│   ├── package.json            # build scripts (esbuild → zip)
│   └── tsconfig.json
├── frontend/                   # React + Vite SPA
│   └── src/App.tsx             # fetches /movers; stats, featured card, chart, watchlist
├── terraform/
│   ├── main.tf                 # provider, default tags, S3 backend
│   ├── variables.tf            # massive_api_key (sensitive)
│   ├── lambda.tf               # ingestion Lambda, IAM role, EventBridge cron
│   ├── api.tf                  # API Lambda, IAM role, API Gateway
│   ├── frontend.tf             # S3 static website bucket + policy
│   ├── monitoring.tf           # CloudWatch alarm on ingestion errors
│   ├── cicd.tf                 # GitHub Actions OIDC provider + deploy role
│   └── backend-bucket.tf       # S3 bucket holding remote Terraform state
└── README.md
```

## Deploy From Scratch

### Prerequisites

- AWS account with credentials configured (`aws configure`)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- Node.js 20+
- A free [Massive](https://massive.com) API key

### 1. Clone

```bash
git clone https://github.com/calluste/Daily-Top-Movers.git
cd Daily-Top-Movers
```

### 2. Configure remote state (first-time setup)

This project stores Terraform state in a private S3 bucket. The bucket name is hardcoded in `terraform/main.tf` and is unique to the original deployment, so a new deployer should point it at their own bucket.

Open `terraform/main.tf` and update the `backend "s3"` block's `bucket` value to a name you own (or remove the `backend "s3"` block entirely to use local state for a quick test deploy).

### 3. Build the Lambda functions

```bash
cd backend
npm install
npm run build        # bundles both Lambdas with esbuild and zips them
cd ..
```

This produces `backend/ingest.zip` and `backend/api.zip`, which Terraform deploys.

### 4. Provision infrastructure

```bash
cd terraform
export TF_VAR_massive_api_key="YOUR_MASSIVE_API_KEY"
terraform init
terraform apply
```

After apply, Terraform prints two outputs you'll need:

- `api_url` — the public API endpoint
- `website_url` — the public site URL

### 5. Build and deploy the frontend

The frontend reads the API URL at build time. Create `frontend/.env`:

```bash
cd ../frontend
echo "VITE_API_URL=<api_url without the /movers suffix>" > .env
npm install
npm run build
```

Then sync the build output to the S3 bucket (bucket name comes from the `website_url` output):

```bash
aws s3 sync dist/ s3://<your-frontend-bucket-name>/ --delete
```

### 6. (Optional) Seed data immediately

The cron runs on its own each weekday night, but you can populate data right away by invoking the ingestion Lambda for a specific date:

```bash
aws lambda invoke \
  --function-name stocks-pipeline-ingest \
  --payload '{"date":"2026-06-12"}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/out.json
```

Omit the `--payload` to ingest the most recent trading day automatically (this is what the cron does).

## Continuous Deployment

A GitHub Actions workflow (`.github/workflows/deploy.yml`) redeploys the full stack on every push to `main`. It authenticates to AWS using **OIDC** — GitHub exchanges a short-lived identity token for temporary AWS credentials, scoped to this repository. No long-lived AWS access keys are stored anywhere.

The workflow builds both Lambdas, runs `terraform apply`, builds the frontend, and syncs it to S3. Two repository secrets drive it: `AWS_ROLE_ARN` (the deploy role) and `MASSIVE_API_KEY`.

## Trade-offs & Decisions

- **HTTP-only frontend.** S3 static website hosting serves over HTTP, not HTTPS. This was the simplest path meeting the requirement. HTTPS would require fronting the bucket with CloudFront (free-tier capable) plus an Origin Access Control — a worthwhile production upgrade, omitted here to keep the stack minimal.
- **Remote Terraform state in S3.** State began local, then migrated to a versioned, encrypted, private S3 bucket so that both local runs and the CI pipeline share one source of truth. The state bucket itself is bootstrapped with local state (the standard chicken-and-egg resolution).
- **Broad CI deploy role vs. least-privilege runtime roles.** The Lambda *runtime* roles are tightly scoped (`PutItem` / `Query` only). The GitHub Actions *deploy* role is intentionally broad, since deploying the stack requires creating and updating many resource types — analogous to the permissions a human operator running `terraform apply` would hold.
- **Grouped endpoint over per-ticker loop.** Trades a small amount of local filtering for staying comfortably within the API rate limit and reducing failure surface to a single request per day.
- **PAY_PER_REQUEST DynamoDB.** No provisioned capacity to manage; usage (one write/day, a handful of reads) rounds to effectively free.
