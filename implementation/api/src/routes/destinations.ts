import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { resolveUserTeam } from '../services/team-service';
import { logger } from '../logging';

export const destinationsRouter = Router();

/**
 * Destination tree structure matching the frontend's DestinationNode type.
 * In a full implementation this would come from DynamoDB or a config service.
 * For now, returns a static tree filtered by the user's region.
 */

interface DestinationNode {
  id: string;
  name: string;
  type: 'region' | 'team' | 'binder' | 'folder';
  region: string;
  children?: DestinationNode[];
}

// Static destination config — matches what's in DynamoDB routing table
const DESTINATION_TREES: Record<string, DestinationNode> = {
  'region-a': {
    id: 'reg-us-east',
    name: 'US-East',
    type: 'region',
    region: 'us-east',
    children: [
      {
        id: 'team-alpha',
        name: 'Team Alpha',
        type: 'team',
        region: 'us-east',
        children: [
          {
            id: 'bind-regulatory',
            name: 'Regulatory',
            type: 'binder',
            region: 'us-east',
            children: [
              { id: 'fold-fda', name: 'FDA Submissions', type: 'folder', region: 'us-east' },
              { id: 'fold-irb', name: 'IRB Approvals', type: 'folder', region: 'us-east' },
            ],
          },
          {
            id: 'bind-clinical',
            name: 'Clinical',
            type: 'binder',
            region: 'us-east',
            children: [
              { id: 'fold-consent', name: 'Patient Consent Forms', type: 'folder', region: 'us-east' },
              { id: 'fold-adverse', name: 'Adverse Event Reports', type: 'folder', region: 'us-east' },
            ],
          },
        ],
      },
    ],
  },
  'region-b': {
    id: 'reg-eu-west',
    name: 'EU-West',
    type: 'region',
    region: 'eu-west',
    children: [
      {
        id: 'team-beta',
        name: 'Team Beta',
        type: 'team',
        region: 'eu-west',
        children: [
          {
            id: 'bind-ema',
            name: 'EMA Submissions',
            type: 'binder',
            region: 'eu-west',
            children: [
              { id: 'fold-cta', name: 'Clinical Trial Applications', type: 'folder', region: 'eu-west' },
              { id: 'fold-safety', name: 'Safety Reports', type: 'folder', region: 'eu-west' },
            ],
          },
          {
            id: 'bind-site-docs',
            name: 'Site Documents',
            type: 'binder',
            region: 'eu-west',
            children: [
              { id: 'fold-ethics', name: 'Ethics Committee', type: 'folder', region: 'eu-west' },
            ],
          },
        ],
      },
    ],
  },
  'region-c': {
    id: 'reg-ap-southeast',
    name: 'AP-Southeast',
    type: 'region',
    region: 'ap-southeast',
    children: [
      {
        id: 'team-gamma',
        name: 'Team Gamma',
        type: 'team',
        region: 'ap-southeast',
        children: [
          {
            id: 'bind-tga',
            name: 'TGA Regulatory',
            type: 'binder',
            region: 'ap-southeast',
            children: [
              { id: 'fold-ctn', name: 'CTN Applications', type: 'folder', region: 'ap-southeast' },
              { id: 'fold-safety-notif', name: 'Safety Notifications', type: 'folder', region: 'ap-southeast' },
            ],
          },
          {
            id: 'bind-site-files',
            name: 'Site Files',
            type: 'binder',
            region: 'ap-southeast',
            children: [
              { id: 'fold-brochures', name: 'Investigator Brochures', type: 'folder', region: 'ap-southeast' },
            ],
          },
        ],
      },
    ],
  },
};

// Map team regions to destination tree keys
const REGION_MAP: Record<string, string> = {
  'region-a': 'region-a',
  'region-b': 'region-b',
  'region-c': 'region-c',
};

/**
 * GET /api/destinations
 * Returns the destination tree for the authenticated user's region.
 */
destinationsRouter.get('/destinations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const team = await resolveUserTeam(userId);
    const regionKey = team.region; // e.g., "region-a"

    const tree = DESTINATION_TREES[regionKey];

    if (!tree) {
      // Return empty tree for unknown regions
      res.json({
        region: regionKey,
        regionDisplayName: regionKey,
        destinations: tree || null,
      });
      return;
    }

    res.json({
      region: regionKey,
      regionDisplayName: tree.name,
      destinations: tree,
    });
  } catch (err) {
    logger.error('Error fetching destinations', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});
