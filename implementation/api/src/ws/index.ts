import { logger } from '../logging';
import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { connectionManager } from './connection-manager';

/**
 * Initialize the WebSocket server on the same HTTP server as Express.
 * Clients connect via: ws://host:port/ws?userId=user-1
 */
export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  });

  wss.on('connection', (ws, req) => {
    connectionManager.addConnection(ws, req);

    // Handle incoming messages (ping/pong or future commands)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  logger.info('WebSocket server initialized', { path: '/ws' });
  return wss;
}

export { connectionManager } from './connection-manager';
export { notifyTaskStatus, notifyJobStatus, isUserListening } from './status-notifier';
