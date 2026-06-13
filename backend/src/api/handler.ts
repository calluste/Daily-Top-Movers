import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300",
};

interface MoverItem {
  SK: string;
  ticker: string;
  pctChange: number;
  closePrice: number;
}

export const handler = async (): Promise<{
  statusCode: number;
  headers: typeof CORS_HEADERS;
  body: string;
}> => {
  try {
    const result = await ddbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": "MOVER" },
        ScanIndexForward: false,
        Limit: 7,
      })
    );

    const items = (result.Items ?? []) as MoverItem[];
    const movers = items.map((item) => ({
      date: item.SK,
      ticker: item.ticker,
      pctChange: item.pctChange,
      closePrice: item.closePrice,
    }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ movers }),
    };
  } catch (err) {
    console.error("Query failed:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};