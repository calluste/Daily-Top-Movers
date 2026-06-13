# --- IAM role for the API Lambda (read-only) ---

resource "aws_iam_role" "api_lambda" {
  name = "stocks-pipeline-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "stocks-pipeline-api-policy"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "QueryMoversTable"
        Effect   = "Allow"
        Action   = "dynamodb:Query"
        Resource = aws_dynamodb_table.daily_movers.arn
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

# --- The API Lambda ---

resource "aws_lambda_function" "api" {
  function_name    = "stocks-pipeline-api"
  role             = aws_iam_role.api_lambda.arn
  filename         = "../backend/api.zip"
  source_code_hash = filebase64sha256("../backend/api.zip")
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.daily_movers.name
    }
  }
}

# --- API Gateway (HTTP API) ---

resource "aws_apigatewayv2_api" "movers" {
  name          = "stocks-pipeline-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.movers.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.movers.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_movers" {
  api_id    = aws_apigatewayv2_api.movers.id
  route_key = "GET /movers"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.movers.execution_arn}/*/*"
}

# --- Output the public URL ---

output "api_url" {
  value       = "${aws_apigatewayv2_api.movers.api_endpoint}/movers"
  description = "Public endpoint for the movers API"
}