import { FastifyReply } from 'fastify';

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function sendError(reply: FastifyReply, error: ApiError) {
  // Only expose safe detail fields to the client
  const safeDetails: Record<string, unknown> = {};
  if (error.details) {
    const allowedKeys = ['field', 'reason', 'expected', 'actual'];
    for (const key of allowedKeys) {
      if (error.details[key] !== undefined) {
        safeDetails[key] = error.details[key];
      }
    }
  }

  reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      details: safeDetails
    }
  });
}
