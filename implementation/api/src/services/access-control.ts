/**
 * Access control — interim per-user allow/deny model (ADR-0014, OPEN).
 *
 * For this release, access is an explicit allow/deny map keyed by Cognito identity
 * (sub or email). It controls which navigation areas a user sees and whether they
 * may upload. This is intentionally simple and illustrative.
 *
 * Long-term (to ratify): derive access from Cognito groups/claims plus a managed
 * access list, removing this hardcoded map. Enforcement must stay server-side —
 * client-side hiding alone is not access control.
 */

export interface UserAccess {
  /** Navigation areas the user may see, e.g. ['dashboard','jobs','upload','destinations']. */
  allowedRoutes: string[];
  /** Whether the user may upload / create jobs. */
  canUpload: boolean;
}

// Default for any authenticated user not explicitly listed: full access incl. upload.
// This preserves the pre-allow/deny behavior ("any authenticated user may upload").
// The deny path is demonstrated by an explicit entry (user-b) below.
const DEFAULT_ACCESS: UserAccess = {
  allowedRoutes: ['dashboard', 'jobs', 'destinations', 'upload'],
  canUpload: true,
};

// Two demo personas (ADR-0014), keyed by email or user id (case-insensitive):
//   user-a: full access incl. upload (allow path).
//   user-b: browse-only, upload DENIED (deny path).
const ACCESS_MAP: Record<string, UserAccess> = {
  'user-a': { allowedRoutes: ['dashboard', 'jobs', 'destinations', 'upload'], canUpload: true },
  'user-a@docbridge.local': {
    allowedRoutes: ['dashboard', 'jobs', 'destinations', 'upload'],
    canUpload: true,
  },
  'user-b': { allowedRoutes: ['dashboard', 'jobs', 'destinations'], canUpload: false },
  'user-b@docbridge.local': {
    allowedRoutes: ['dashboard', 'jobs', 'destinations'],
    canUpload: false,
  },
};

/**
 * Resolve the access entry for a user by id and/or email.
 * Matching order: exact user id, then email, else default (browse-only).
 */
export function getAccess(userId: string, email?: string): UserAccess {
  const byId = ACCESS_MAP[userId?.toLowerCase?.() ?? ''];
  if (byId) return byId;
  if (email) {
    const byEmail = ACCESS_MAP[email.toLowerCase()];
    if (byEmail) return byEmail;
  }
  return DEFAULT_ACCESS;
}
