/**
 * Cognito authentication module.
 * Handles sign-in, token storage, and session management.
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const USER_POOL_ID = 'us-east-1_jCnHbWlwq';
const CLIENT_ID = '4ocgklslli9bqhj9b13dmdf3j3';

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

export interface AuthResult {
  idToken: string;
  accessToken: string;
  email: string;
  name: string;
  sub: string;
}

/**
 * Sign in with email and password.
 * Returns tokens and user attributes on success.
 */
export function signIn(email: string, password: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

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
      onFailure: (err) => {
        reject(new Error(err.message || 'Authentication failed'));
      },
    });
  });
}

/**
 * Get current session if user is already logged in (tokens in localStorage).
 */
export function getCurrentSession(): Promise<AuthResult | null> {
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

/**
 * Sign out the current user.
 */
export function signOut(): void {
  const user = userPool.getCurrentUser();
  if (user) {
    user.signOut();
  }
}

/**
 * Get the current ID token (for Authorization header).
 * Returns null if not authenticated.
 */
export async function getIdToken(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.idToken ?? null;
}
