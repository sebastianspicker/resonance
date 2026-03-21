import type { S3Client } from '@aws-sdk/client-s3';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { verifyAccessToken } from './auth.js';
import { config, limits } from './config.js';
import { ErrorCodes } from './errorCodes.js';
import { ApiError, sendError } from './errors.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerEntryRoutes } from './routes/entries.js';
import { registerFeedbackRoutes } from './routes/feedback.js';

export function buildServer(prisma: PrismaClient, s3: S3Client) {
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.refreshToken',
        'req.body.accessToken',
        'req.body.code',
      ],
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    bodyLimit: limits.bodyLimitBytes,
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  const corsOptions =
    config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : { origin: false };
  app.register(cors, corsOptions);
  app.register(helmet);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(reply, error);
    }
    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Unexpected error',
        details: {},
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, new ApiError(404, ErrorCodes.NOT_FOUND, 'Route not found'));
  });

  const requireAuth = async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, ErrorCodes.MISSING_AUTH, 'Missing or invalid Authorization header');
    }
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    const userId = payload.sub as string | undefined;
    const role = payload.role as 'student' | 'teacher' | undefined;
    if (!userId || !role) {
      throw new ApiError(401, ErrorCodes.INVALID_TOKEN, 'Invalid token payload');
    }
    request.user = { id: userId, role };
  };

  app.get('/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app, prisma, s3, requireAuth);
  registerCourseRoutes(app, prisma, s3, requireAuth);
  registerEntryRoutes(app, prisma, s3, requireAuth);
  registerArtifactRoutes(app, prisma, s3, requireAuth);
  registerFeedbackRoutes(app, prisma, s3, requireAuth);

  return app;
}
