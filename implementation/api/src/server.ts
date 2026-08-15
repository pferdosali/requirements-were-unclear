import { createServer } from 'http';
import { app } from './app';
import { setupWebSocket } from './ws';

const PORT = process.env.PORT || 3000;

const server = createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`DocBridge API running on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
