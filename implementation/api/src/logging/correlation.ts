import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger } from './logger';
import winston from 'winston';

/**
 * Correlation ID middleware.
 *
 * Generates a unique requestId for each incoming request (or uses one from headers).
 * Attaches a child logger with the correlationId to req for use in route handlers.
 *
 * Headers checked (in order):
 * - x-correlation-id
 * - x-request-id
 * - x-amzn-trace-id (AWS ALB/API Gateway)
 *
 * Response includes the correlation ID in x-correlation-id header.
 */
export interface RequestWithLogger extends Request {
  correlationId?: string;
  log?: winston.Logger;
}

export function correlationMiddleware(req: RequestWithLogger, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-amzn-trace-id'] as string) ||
    uuidv4();

  req.correlationId = correlationId;
  req.log = createChildLogger({
    correlationId,
    method: req.method,
    path: req.path,
  });

  // Set correlation ID on response for client tracing
  res.setHeader('x-correlation-id', correlationId);

  next();
}
