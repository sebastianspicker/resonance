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

/** HTTP methods that carry a request body and must send application/json. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

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

  // --- Rate limiting --------------------------------------------------------
  const isLoopback = (ip: string | undefined) =>
    ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: (req, _key) => {
      // Health endpoint should never be throttled (uptime probes, load balancers)
      if (req.url === '/health') return true;
      // In dev mode, exempt localhost to avoid throttling dev/test traffic
      if (config.authMode === 'dev' && isLoopback(req.ip)) return true;
      return false;
    },
  });

  // --- CORS -----------------------------------------------------------------
  const corsOptions =
    config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : { origin: false };
  app.register(cors, corsOptions);

  // --- Helmet (security headers) --------------------------------------------
  app.register(helmet, {
    // API-only CSP: deny everything except JSON responses
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Prevent MIME-type sniffing
    xContentTypeOptions: true,
    // Prevent framing
    frameguard: { action: 'deny' },
    // HSTS: enable in production (1 year, includeSubDomains)
    strictTransportSecurity:
      config.authMode === 'prod' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    // Referrer leak prevention
    referrerPolicy: { policy: 'no-referrer' },
    // Not an HTML app — disable DNS prefetch, download-guard, permitted-cross-domain
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  });

  // --- Remove server identity header ----------------------------------------
  app.addHook('onSend', async (_request, reply) => {
    reply.removeHeader('x-powered-by');
  });

  // --- Content-Type enforcement for request bodies --------------------------
  app.addHook('preHandler', async (request) => {
    if (BODY_METHODS.has(request.method)) {
      const ct = request.headers['content-type'];
      // Allow empty bodies (some POSTs like /entries/:id/submit have no body)
      // and multipart for future file uploads, but otherwise require JSON.
      if (ct && !ct.startsWith('application/json') && !ct.startsWith('multipart/')) {
        throw new ApiError(
          415,
          ErrorCodes.VALIDATION_ERROR,
          'Content-Type must be application/json'
        );
      }
    }
  });

  // --- Error handler --------------------------------------------------------
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(reply, error);
    }

    // Cast to access Fastify error properties (statusCode, code)
    const fastifyErr = error as { statusCode?: number; code?: string };

    // Fastify rate-limit errors have statusCode 429
    if (fastifyErr.statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: ErrorCodes.RATE_LIMITED,
          message: 'Too many requests — please try again later',
          details: {},
        },
      });
    }

    // Fastify content-type parser errors (unsupported media type, invalid JSON, etc.)
    if (
      fastifyErr.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      fastifyErr.code === 'FST_ERR_CTP_INVALID_TYPE' ||
      fastifyErr.code === 'FST_ERR_CTP_EMPTY_TYPE' ||
      (typeof fastifyErr.code === 'string' && fastifyErr.code.startsWith('FST_ERR_CTP'))
    ) {
      return reply.code(415).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Unsupported content type',
          details: {},
        },
      });
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

  // --- Auth hook ------------------------------------------------------------
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

  // --- Routes ---------------------------------------------------------------
  app.get('/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app, prisma, s3, requireAuth);
  registerCourseRoutes(app, prisma, s3, requireAuth);
  registerEntryRoutes(app, prisma, s3, requireAuth);
  registerArtifactRoutes(app, prisma, s3, requireAuth);
  registerFeedbackRoutes(app, prisma, s3, requireAuth);

  return app;
}
