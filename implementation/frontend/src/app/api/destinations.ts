/**
 * Destinations API
 */
import { api } from './client';
import type { DestinationNode } from '../lib/types';

export interface DestinationsResponse {
  region: string;
  regionDisplayName: string;
  destinations: DestinationNode | null;
}

export async function getDestinations(): Promise<DestinationsResponse> {
  return api.get<DestinationsResponse>('/destinations');
}
