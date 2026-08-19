/**
 * Mock team resolution service.
 * In production, this would query a team membership service or Cognito custom attributes.
 * Teams map to regions for destination routing.
 */

export interface Team {
  teamId: string;
  name: string;
  region: string;
}

const MOCK_TEAMS: Record<string, Team> = {
  'user-1': { teamId: 'team-a', name: 'US Clinical Ops', region: 'region-a' },
  'user-2': { teamId: 'team-b', name: 'EU Clinical Ops', region: 'region-b' },
  'user-3': { teamId: 'team-a', name: 'US Clinical Ops', region: 'region-a' },
  'user-4': { teamId: 'team-c', name: 'AP-Southeast Ops', region: 'region-c' },
  'user-5': { teamId: 'team-b', name: 'EU Clinical Ops', region: 'region-b' },
};

const DEFAULT_TEAM: Team = { teamId: 'team-a', name: 'US Clinical Ops', region: 'region-a' };

export async function resolveUserTeam(userId: string): Promise<Team> {
  return MOCK_TEAMS[userId] ?? DEFAULT_TEAM;
}
