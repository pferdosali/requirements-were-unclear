import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { uploadRouter } from './routes/upload';

const app = express();

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => { console.log(`${req.method} ${req.path}`); next(); });
app.use('/health', healthRouter);
app.use('/api', authMiddleware, uploadRouter);

export { app };
