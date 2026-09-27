/**
 * Cognito authentication module.
 *
 * Config comes from build-time env (ADR-0012) so each environment (dev/prod)
 * targets its own Cognito pool. No IDs are hardcoded.
 *
 * Supports:
 *  - email/password sign-in (SRP) via amazon-cognito-identity-js
 *  - "Sign in with Google" via the Cognito Hosted UI (OAuth authorization-code flow)
 *  - current-session restore and sign-out
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
// Hosted UI domain, e.g. https://docbridge-dev-930330383608.auth.us-east-1.amazoncognito.com
const HOSTED_UI_DOMAIN = import.meta.env.VITE_COGNITO_HOSTED_UI_DOMAIN as string | undefined;
const REDIRECT_URI = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || window.location.origin;

function requirePool(): CognitoUserPool {
  if (!USER_POOL_ID || !CLIENT_ID) {
    throw new Error(
      'Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.',
    );
  }
  return new CognitoUserPool({ UserPoolId: USER_POOL_ID, ClientId: CLIENT_ID });
}

export interface AuthResult {
  idToken: string;
  accessToken: string;
  email: string;
  name: string;
  sub: string;
}

export function isConfigured(): boolean {
  return Boolean(USER_POOL_ID && CLIENT_ID);
}

/** Email/password sign-in. Returns tokens and user attributes on success. */
export function signIn(email: string, password: string): Promise<AuthResult> {
  const userPool = requirePool();
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        const idToken = session.getIdToken();
        resolve({
          idToken: idToken.getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          email: idToken.payload.email || email,
          name: idToken.payload.name || email.split('@')[0],
          sub: idToken.payload.sub,
        });
      },
      onFailure: (err) => reject(new Error(err.message || 'Authentication failed')),
    });
  });
}

/**
 * Redirect to the Cognito Hosted UI for "Sign in with Google".
 * The Hosted UI returns to REDIRECT_URI with an authorization code; exchange it
 * on the callback route (or use the implicit id_token in the hash for a simple demo).
 */
export function signInWithGoogle(): void {
  if (!HOSTED_UI_DOMAIN || !CLIENT_ID) {
    throw new Error('Hosted UI is not configured. Set VITE_COGNITO_HOSTED_UI_DOMAIN.');
  }
  const params = new URLSearchParams({
    identity_provider: 'Google',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'openid email profile',
  });
  window.location.href = `${HOSTED_UI_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

/** Restore the current session if the user is already logged in. */
export function getCurrentSession(): Promise<AuthResult | null> {
  if (!isConfigured()) return Promise.resolve(null);
  const userPool = requirePool();
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      const idToken = session.getIdToken();
      resolve({
        idToken: idToken.getJwtToken(),
        accessToken: session.getAccessToken().getJwtToken(),
        email: idToken.payload.email || '',
        name: idToken.payload.name || '',
        sub: idToken.payload.sub,
      });
    });
  });
}

/** Sign out the current user (and clear the Hosted UI session if configured). */
export function signOut(): void {
  if (isConfigured()) {
    const user = requirePool().getCurrentUser();
    if (user) user.signOut();
  }
  if (HOSTED_UI_DOMAIN && CLIENT_ID) {
    const params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: REDIRECT_URI });
    window.location.href = `${HOSTED_UI_DOMAIN}/logout?${params.toString()}`;
  }
}

/** Current ID token for the Authorization header; null if not authenticated. */
export async function getIdToken(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.idToken ?? null;
}
