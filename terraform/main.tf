terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "stocks-pipeline"
      ManagedBy = "terraform"
    }
  }
}
resource "aws_dynamodb_table" "daily_movers" {
  name         = "daily-movers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }
}
resource "aws_secretsmanager_secret" "massive_api_key" {
  name                    = "stocks-pipeline/massive-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "massive_api_key" {
  secret_id     = aws_secretsmanager_secret.massive_api_key.id
  secret_string = var.massive_api_key
}