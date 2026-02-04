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
  reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      details: error.details ?? {}
    }
  });
}
