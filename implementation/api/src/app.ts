import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { uploadRouter } from './routes/upload';
import { jobsRouter } from './routes/jobs';
import { statusRouter } from './routes/status';
import { destinationsRouter } from './routes/destinations';
import { correlationMiddleware, requestLogger } from './logging';

const app = express();

app.use(cors());
app.use(express.json());
app.use(correlationMiddleware);
app.use(requestLogger);
app.use('/health', healthRouter);
app.use('/api', authMiddleware, uploadRouter);
app.use('/api', authMiddleware, jobsRouter);
app.use('/api', authMiddleware, statusRouter);
app.use('/api', authMiddleware, destinationsRouter);

export { app };
