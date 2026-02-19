import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { PrismaClient } from '@prisma/client';
import type { S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { ApiError, sendError } from './errors.js';
import { verifyAccessToken } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerEntryRoutes } from './routes/entries.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerFeedbackRoutes } from './routes/feedback.js';

export function buildServer(prisma: PrismaClient, s3: S3Client) {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId'
  });

  const corsOrigin = config.corsOrigins.length > 0 ? config.corsOrigins : true;
  app.register(cors, { origin: corsOrigin });
  app.register(helmet);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(reply, error);
    }
    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error',
        details: {}
      }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, new ApiError(404, 'NOT_FOUND', 'Route not found'));
  });

  const requireAuth = async (request: unknown) => {
    const req = request as { headers: { authorization?: string }; user?: unknown };
    const header = req.headers.authorization;
    if (!header) {
      throw new ApiError(401, 'MISSING_AUTH', 'Missing Authorization header');
    }
    const token = header.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    const userId = payload.sub as string | undefined;
    const role = payload.role as 'student' | 'teacher' | undefined;
    if (!userId || !role) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid token payload');
    }
    req.user = { id: userId, role };
  };

  app.get('/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app, prisma, s3, requireAuth);
  registerCourseRoutes(app, prisma, s3, requireAuth);
  registerEntryRoutes(app, prisma, s3, requireAuth);
  registerArtifactRoutes(app, prisma, s3, requireAuth);
  registerFeedbackRoutes(app, prisma, s3, requireAuth);

  return app;
}
