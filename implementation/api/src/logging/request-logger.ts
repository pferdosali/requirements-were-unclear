import { Response, NextFunction } from 'express';
import { RequestWithLogger } from './correlation';

/**
 * HTTP request/response logging middleware.
 * Logs each request with method, path, status code, and duration.
 */
export function requestLogger(req: RequestWithLogger, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = req.log;

    if (log) {
      const logData = {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.headers['user-agent'],
        userId: (req as any).user?.userId,
      };

      if (res.statusCode >= 500) {
        log.error('request_completed', logData);
      } else if (res.statusCode >= 400) {
        log.warn('request_completed', logData);
      } else {
        log.info('request_completed', logData);
      }
    }
  });

  next();
}
