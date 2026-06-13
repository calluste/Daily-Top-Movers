# --- GitHub Actions OIDC provider ---

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# --- Role that GitHub Actions assumes via OIDC ---

resource "aws_iam_role" "github_actions" {
  name = "stocks-pipeline-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:calluste/Daily-Top-Movers:*"
        }
      }
    }]
  })
}

# --- Permissions the pipeline needs to deploy the whole stack ---

resource "aws_iam_role_policy" "github_actions" {
  name = "stocks-pipeline-deploy-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DeployStack"
      Effect   = "Allow"
      Action = [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "iam:*",
        "events:*",
        "secretsmanager:*",
        "cloudwatch:*",
        "logs:*"
      ]
      Resource = "*"
    }]
  })
}

output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions.arn
  description = "ARN for the GitHub Actions deploy role (set as AWS_ROLE_ARN secret)"
}