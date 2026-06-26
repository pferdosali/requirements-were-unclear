import express from 'express';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { uploadRouter } from './routes/upload';

const app = express();

app.use(express.json());
app.use('/health', healthRouter);
app.use('/api', authMiddleware, uploadRouter);

export { app };
