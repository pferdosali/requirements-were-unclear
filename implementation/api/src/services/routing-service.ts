import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ROUTING_TABLE = process.env.ROUTING_TABLE || 'docbridge-routing-config';

const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
});

export interface DestinationConfig {
  endpointUrl: string;
  authType: 'bearer' | 'api-key' | 'none';
  authToken: string | null;
  destinationName: string;
}

/**
 * Look up destination endpoint config from the DynamoDB routing table.
 *
 * Key schema:
 *   - partition: destination_region (= task's destinationId, e.g. "region-a")
 *   - sort: tenant_id (= user's team, e.g. "team-a")
 *
 * Returns the endpoint URL, auth type, and credentials needed to deliver files.
 */
export async function resolveDestination(
  destinationId: string,
  tenantId: string,
): Promise<DestinationConfig | null> {
  const command = new GetItemCommand({
    TableName: ROUTING_TABLE,
    Key: {
      destination_region: { S: destinationId },
      tenant_id: { S: tenantId },
    },
  });

  const result = await dynamodb.send(command);

  if (!result.Item) {
    return null;
  }

  return {
    endpointUrl: result.Item.endpoint_url?.S ?? '',
    authType: (result.Item.auth_type?.S as DestinationConfig['authType']) ?? 'none',
    authToken: result.Item.auth_token?.S ?? null,
    destinationName: result.Item.destination_name?.S ?? destinationId,
  };
}
