import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { requireField } from '../validation.js';
import {
  issueTokens,
  rotateRefreshToken,
  issueDevAuthCode,
  consumeDevAuthCode,
  upsertDevUser
} from '../auth.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  _s3: unknown,
  requireAuth: (request: unknown) => Promise<void>
) {
  app.get('/dev/login', async (_request, reply) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }
    const html = `<!doctype html>
<html>
  <head><title>Resonance Dev Login</title></head>
  <body>
    <h1>Resonance Dev Login</h1>
    <p>Select a role to continue.</p>
    <ul>
      <li><a href="/dev/authorize?role=student">Login as Student</a></li>
      <li><a href="/dev/authorize?role=teacher">Login as Teacher</a></li>
    </ul>
  </body>
</html>`;
    reply.type('text/html').send(html);
  });

  app.get('/dev/authorize', async (request, reply) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }
    const role = (request.query as { role?: string }).role as 'student' | 'teacher' | undefined;
    if (!role || (role !== 'student' && role !== 'teacher')) {
      throw new ApiError(400, 'INVALID_ROLE', 'Invalid role');
    }
    const user = await upsertDevUser(prisma, role);
    const code = issueDevAuthCode(user.id);
    const redirectUrl = new URL(config.devLoginCallbackUrl);
    redirectUrl.searchParams.set('code', code);
    reply.redirect(redirectUrl.toString());
  });

  app.post('/dev/issue', async (request) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }
    const body = request.body as { role?: 'student' | 'teacher'; userId?: string };
    const role = body?.role ?? 'student';
    let user;
    if (body?.userId) {
      user = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!user) {
        throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
      }
    } else {
      user = await upsertDevUser(prisma, role);
    }
    const code = issueDevAuthCode(user.id);
    return { code };
  });

  app.post('/auth/session', async (request) => {
    const body = request.body as { code?: string; redirectUri?: string };
    const code = requireField(body?.code, 'code');
    if (config.authMode !== 'dev') {
      throw new ApiError(501, 'AUTH_NOT_CONFIGURED', 'Production auth not configured');
    }
    const userId = consumeDevAuthCode(code);
    if (!userId) {
      throw new ApiError(401, 'INVALID_CODE', 'Invalid or expired auth code');
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(401, 'USER_NOT_FOUND', 'User not found');
    }
    const tokens = await issueTokens(prisma, user);
    return {
      ...tokens,
      user: { id: user.id, displayName: user.displayName, globalRole: user.globalRole }
    };
  });

  app.post('/auth/refresh', async (request) => {
    const body = request.body as { refreshToken?: string };
    const refreshToken = requireField(body?.refreshToken, 'refreshToken');
    const tokens = await rotateRefreshToken(prisma, refreshToken);
    return tokens;
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
    if (!userRecord) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return {
      id: userRecord.id,
      displayName: userRecord.displayName,
      globalRole: userRecord.globalRole
    };
  });
}
