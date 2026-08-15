import { createServer } from 'http';
import { app } from './app';
import { setupWebSocket } from './ws';
import { logger } from './logging';

const PORT = process.env.PORT || 3000;

const server = createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  logger.info('DocBridge API started', { port: PORT });
  logger.info('WebSocket available', { path: `/ws` });
});
