import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

interface AuthStackProps extends cdk.StackProps {
  /** 'dev' | 'prod' — used to name per-environment resources. */
  envName: string;
}

/**
 * Cognito auth for DocBridge.
 *
 * - One user pool per environment (docbridge-users-<env>).
 * - Email sign-in; self sign-up disabled (users are admin-created / seeded).
 * - Hosted UI domain so the SPA can use the OAuth authorization-code flow and
 *   federated "Sign in with Google" (ADR-0003).
 * - Google is wired as a federated identity provider when GOOGLE_CLIENT_ID /
 *   GOOGLE_CLIENT_SECRET are provided (via CDK context or env). Secrets must NOT
 *   be committed — pass them at deploy time or reference Secrets Manager.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { envName } = props;

    this.userPool = new cognito.UserPool(this, 'DocBridgeUserPool', {
      userPoolName: `docbridge-users-${envName}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Hosted UI domain (required for the OAuth flow + Google federation).
    // Domain prefix must be globally unique within the region.
    this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: `docbridge-${envName}-${this.account}` },
    });

    // Optional Google federation. Only added when credentials are supplied,
    // so `cdk synth` works without secrets present.
    const googleClientId =
      this.node.tryGetContext('googleClientId') || process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret =
      this.node.tryGetContext('googleClientSecret') || process.env.GOOGLE_CLIENT_SECRET;

    const supportedIdps: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];

    if (googleClientId && googleClientSecret) {
      const google = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdp', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });
      this.userPool.registerIdentityProvider(google);
      supportedIdps.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    // Callback/logout URLs: local dev + the environment's CloudFront origin.
    const callbackUrls = [
      'http://localhost:5173',
      'http://localhost:5173/callback',
    ];
    const logoutUrls = ['http://localhost:5173'];
    const cloudfrontUrl = this.node.tryGetContext('cloudfrontUrl');
    if (cloudfrontUrl) {
      callbackUrls.push(cloudfrontUrl, `${cloudfrontUrl}/callback`);
      logoutUrls.push(cloudfrontUrl);
    }

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: supportedIdps,
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
