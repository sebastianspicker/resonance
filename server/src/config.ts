import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  authMode: (() => {
    const mode = process.env.AUTH_MODE ?? 'prod';
    if (mode !== 'dev' && mode !== 'prod') {
      throw new Error('AUTH_MODE must be "dev" or "prod"');
    }
    return mode;
  })(),
  jwtSecret: requireEnv('JWT_SECRET'),
  accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  s3: {
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: requireEnv('S3_BUCKET'),
    accessKey: requireEnv('S3_ACCESS_KEY'),
    secretKey: requireEnv('S3_SECRET_KEY'),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    presignTtlSeconds: Number(process.env.S3_PRESIGN_TTL_SECONDS ?? 900)
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  devLoginCallbackUrl: process.env.DEV_LOGIN_CALLBACK_URL ?? 'resonance://auth-callback',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:4000'
};
