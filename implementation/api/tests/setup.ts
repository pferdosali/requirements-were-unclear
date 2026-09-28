// Jest setup: enable the dev x-user-id auth fallback so existing tests
// (which authenticate via the x-user-id header) run without a live Cognito pool.
// Production/dev runtime leaves ALLOW_DEV_AUTH_HEADER unset unless explicitly enabled.
process.env.ALLOW_DEV_AUTH_HEADER = 'true';
