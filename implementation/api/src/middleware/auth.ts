import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Mock authentication middleware.
 * In production, this will validate JWT tokens from Cognito.
 * For now, it reads a user ID from the x-user-id header or defaults to a mock user.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  req.user = { userId, email: `${userId}@mock.docbridge.local` };
  next();
}
