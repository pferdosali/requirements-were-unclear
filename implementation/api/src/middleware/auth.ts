import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getAccess, UserAccess } from '../services/access-control';
import { logger } from '../logging';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  /** Access entry resolved from the allow/deny model (ADR-0014). */
  access: UserAccess;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// --- Cognito JWT verification (ADR-0003) ---
// Configured from env so each environment (dev/prod) points at its own pool.
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
// Dev-only fallback: allow the x-user-id header when explicitly enabled.
const ALLOW_HEADER_FALLBACK = process.env.ALLOW_DEV_AUTH_HEADER === 'true';

// Lazily construct the verifier so the app boots (and tests run) without Cognito config.
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
function getVerifier() {
  if (!verifier && USER_POOL_ID && CLIENT_ID) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: 'id',
      clientId: CLIENT_ID,
    });
  }
  return verifier;
}

/**
 * Authentication middleware.
 *
 * 1. If an `Authorization: Bearer <jwt>` header is present and Cognito is configured,
 *    verify the token against the pool JWKS and derive the user from its claims.
 * 2. Otherwise, if ALLOW_DEV_AUTH_HEADER=true, fall back to the `x-user-id` header
 *    (development / tests only).
 * 3. Otherwise reject with 401.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;

  const v = getVerifier();
  if (bearer && v) {
    try {
      const payload = await v.verify(bearer);
      const userId = (payload.sub as string) || (payload['cognito:username'] as string);
      const email = (payload.email as string) || `${userId}@docbridge.local`;
      req.user = { userId, email, access: getAccess(userId, email) };
      next();
      return;
    } catch (err) {
      logger.warn('JWT verification failed', { error: (err as Error).message });
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  if (ALLOW_HEADER_FALLBACK) {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }
    const email = `${userId}@mock.docbridge.local`;
    req.user = { userId, email, access: getAccess(userId, email) };
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}

/**
 * Authorization guard: require upload permission (ADR-0014).
 * Apply to routes that create uploads or jobs. Enforced server-side so that
 * client-side hiding is never the only control.
 */
export function requireUploadAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.access?.canUpload) {
    res.status(403).json({ error: 'Upload access denied for this user' });
    return;
  }
  next();
}
