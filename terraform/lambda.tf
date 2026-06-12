# --- IAM role the ingestion Lambda runs as ---

resource "aws_iam_role" "ingest_lambda" {
  name = "stocks-pipeline-ingest-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ingest_lambda" {
  name = "stocks-pipeline-ingest-policy"
  role = aws_iam_role.ingest_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteToMoversTable"
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = aws_dynamodb_table.daily_movers.arn
      },
      {
        Sid      = "ReadApiKeySecret"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.massive_api_key.arn
      },
      {
        Sid      = "WriteLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}
# --- The ingestion Lambda itself ---

resource "aws_lambda_function" "ingest" {
  function_name    = "stocks-pipeline-ingest"
  role             = aws_iam_role.ingest_lambda.arn
  filename         = "../backend/ingest.zip"
  source_code_hash = filebase64sha256("../backend/ingest.zip")
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.daily_movers.name
      SECRET_ID  = aws_secretsmanager_secret.massive_api_key.id
    }
  }
}

# --- Schedule: weekdays 22:30 UTC, after US market close ---

resource "aws_cloudwatch_event_rule" "daily_ingest" {
  name                = "stocks-pipeline-daily-ingest"
  schedule_expression = "cron(30 22 ? * MON-FRI *)"
}

resource "aws_cloudwatch_event_target" "daily_ingest" {
  rule = aws_cloudwatch_event_rule.daily_ingest.name
  arn  = aws_lambda_function.ingest.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_ingest.arn
}