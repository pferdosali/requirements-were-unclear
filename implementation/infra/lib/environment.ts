import { Construct } from 'constructs';

export function resourceName(scope: Construct, productionName: string): string {
  return scope.node.tryGetContext('environment') === 'staging'
    ? `${productionName}-staging` : productionName;
}
