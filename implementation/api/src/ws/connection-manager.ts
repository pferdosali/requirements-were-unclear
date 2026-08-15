import { logger } from '../logging';
import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

/**
 * WebSocket Connection Manager
 *
 * Manages connected clients, authenticates via x-user-id query param,
 * and provides methods to send messages to specific users.
 */

export interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  connectedAt: Date;
}

export class ConnectionManager {
  private clients: Map<string, Set<ConnectedClient>> = new Map();

  /**
   * Get the total number of connected clients.
   */
  get connectionCount(): number {
    let count = 0;
    for (const clientSet of this.clients.values()) {
      count += clientSet.size;
    }
    return count;
  }

  /**
   * Register a new WebSocket connection.
   * Authenticates the user from the connection URL query string.
   */
  addConnection(ws: WebSocket, req: IncomingMessage): ConnectedClient | null {
    const userId = this.extractUserId(req);
    if (!userId) {
      ws.close(4001, 'Missing user authentication');
      return null;
    }

    const client: ConnectedClient = {
      ws,
      userId,
      connectedAt: new Date(),
    };

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(client);

    // Handle disconnect
    ws.on('close', () => {
      this.removeConnection(client);
    });

    ws.on('error', () => {
      this.removeConnection(client);
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      userId,
      timestamp: new Date().toISOString(),
    });

    logger.info('WebSocket connected', { userId: client.userId, total: this.connectionCount });
    return client;
  }

  /**
   * Remove a client connection.
   */
  removeConnection(client: ConnectedClient): void {
    const clientSet = this.clients.get(client.userId);
    if (clientSet) {
      clientSet.delete(client);
      if (clientSet.size === 0) {
        this.clients.delete(client.userId);
      }
    }
    logger.info('WebSocket disconnected', { userId: client.userId, total: this.connectionCount });
  }

  /**
   * Send a message to all connections for a specific user.
   */
  sendToUser(userId: string, message: object): number {
    const clientSet = this.clients.get(userId);
    if (!clientSet || clientSet.size === 0) {
      return 0;
    }

    let sent = 0;
    for (const client of clientSet) {
      if (this.sendToClient(client, message)) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Send a message to a specific client.
   */
  sendToClient(client: ConnectedClient, message: object): boolean {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Check if a user has any active connections.
   */
  isUserConnected(userId: string): boolean {
    const clientSet = this.clients.get(userId);
    return !!clientSet && clientSet.size > 0;
  }

  /**
   * Get all connected user IDs.
   */
  getConnectedUsers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Close all connections (for graceful shutdown).
   */
  closeAll(): void {
    for (const clientSet of this.clients.values()) {
      for (const client of clientSet) {
        client.ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();
  }

  /**
   * Extract user ID from WebSocket connection request.
   * Reads from query param: ws://host/ws?userId=user-1
   */
  private extractUserId(req: IncomingMessage): string | null {
    const url = parseUrl(req.url || '', true);
    const userId = url.query['userId'] as string;
    return userId || null;
  }
}

// Singleton instance for the application
export const connectionManager = new ConnectionManager();
