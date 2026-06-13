# --- Alarm: fire if the ingestion Lambda errors ---

resource "aws_cloudwatch_metric_alarm" "ingest_errors" {
  alarm_name          = "stocks-pipeline-ingest-errors"
  alarm_description   = "Ingestion Lambda reported one or more errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.ingest.function_name
  }
}