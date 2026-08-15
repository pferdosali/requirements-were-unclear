import winston from 'winston';

/**
 * Structured JSON logger for DocBridge.
 *
 * All logs are emitted as JSON with consistent fields:
 * - timestamp: ISO 8601
 * - level: error | warn | info | debug
 * - message: human-readable description
 * - service: 'docbridge-api' or 'docbridge-worker'
 * - correlationId: request/task trace ID (when available)
 * - ...context: additional structured fields
 *
 * In production, CloudWatch Logs Insights can query these JSON fields directly.
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = process.env.SERVICE_NAME || 'docbridge-api';

const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: SERVICE_NAME },
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export { logger };

/**
 * Create a child logger with bound context (e.g., correlationId, userId).
 * Use this for request-scoped or task-scoped logging.
 */
export function createChildLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}

/**
 * Audit event logger — specifically for business-critical events
 * that should be queryable and retained for compliance.
 */
export function auditLog(event: string, data: Record<string, any>): void {
  logger.info(event, {
    audit: true,
    event,
    ...data,
  });
}
