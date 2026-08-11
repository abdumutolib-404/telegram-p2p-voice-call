/**
 * test/harness/socketClient.js
 * Socket.io client test helper supporting real connections & fast in-memory mock socket hubs.
 */

const { EventEmitter } = require('events');

/**
 * MockSocket simulates a Socket.io client socket connection in memory.
 */
class MockSocket extends EventEmitter {
  constructor(id = `socket_${Math.random().toString(36).substring(2, 9)}`, userContext = null) {
    super();
    this.id = id;
    this.connected = true;
    this.disconnected = false;
    this.userContext = userContext;
    this.emittedEvents = [];
    this.hub = null;
  }

  emit(event, data, callback) {
    this.emittedEvents.push({ event, data, timestamp: Date.now() });
    
    if (this.hub) {
      this.hub.routeClientEmit(this, event, data, callback);
    }
    
    // Also trigger local event if needed
    super.emit('client_emit', event, data);
    return this;
  }

  receive(event, data) {
    super.emit(event, data);
  }

  disconnect() {
    if (!this.disconnected) {
      this.connected = false;
      this.disconnected = true;
      super.emit('disconnect', 'io client disconnect');
      if (this.hub) {
        this.hub.removeSocket(this.id);
      }
    }
    return this;
  }

  close() {
    return this.disconnect();
  }
}

/**
 * MockSocketHub provides an in-memory server & routing layer for socket clients without network overhead.
 */
class MockSocketHub extends EventEmitter {
  constructor() {
    super();
    this.sockets = new Map();
    this.serverHandlers = new Map();
  }

  createClient(userId = null) {
    const socket = new MockSocket(`socket_${userId || Math.random().toString(36).substring(2, 9)}`, { userId });
    socket.hub = this;
    this.sockets.set(socket.id, socket);
    this.emit('connection', socket);
    return socket;
  }

  removeSocket(socketId) {
    this.sockets.delete(socketId);
  }

  onServerEvent(event, handler) {
    this.serverHandlers.set(event, handler);
  }

  routeClientEmit(clientSocket, event, data, callback) {
    const handler = this.serverHandlers.get(event);
    if (handler) {
      handler(clientSocket, data, callback);
    }
    this.emit('client_event', { socketId: clientSocket.id, event, data });
  }

  broadcastToAll(event, data) {
    for (const socket of this.sockets.values()) {
      socket.receive(event, data);
    }
  }

  sendToSocket(socketId, event, data) {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.receive(event, data);
      return true;
    }
    return false;
  }

  clear() {
    for (const socket of this.sockets.values()) {
      socket.disconnect();
    }
    this.sockets.clear();
    this.serverHandlers.clear();
  }
}

/**
 * Creates a Socket.io client connection. Uses real socket.io-client if url is provided,
 * otherwise creates an in-memory MockSocket.
 * @param {string} [serverUrl] - URL of running Socket.io server
 * @param {object} [options] - Connection options
 * @returns {object} Socket client instance
 */
function createTestSocket(serverUrl = null, options = {}) {
  if (serverUrl) {
    try {
      const io = require('socket.io-client');
      return io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        ...options
      });
    } catch (_) {
      // Fallback to MockSocket if socket.io-client is not available
    }
  }

  return new MockSocket(options.id, options.userContext);
}

/**
 * Waits for a specific event on a socket client within a timeout limit.
 * @param {object} socket - Real or Mock socket client
 * @param {string} eventName - Name of event to listen for
 * @param {number} [timeoutMs=3000] - Max wait time in milliseconds
 * @returns {Promise<any>} Resolves with payload data
 */
function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for socket event '${eventName}' after ${timeoutMs}ms`));
    }, timeoutMs);

    function handler(data) {
      cleanup();
      resolve(data);
    }

    function cleanup() {
      clearTimeout(timer);
      if (typeof socket.off === 'function') {
        socket.off(eventName, handler);
      } else if (typeof socket.removeListener === 'function') {
        socket.removeListener(eventName, handler);
      }
    }

    socket.on(eventName, handler);
  });
}

/**
 * Emits an event on socket and waits for a specific response event.
 * @param {object} socket
 * @param {string} emitEvent
 * @param {any} payload
 * @param {string} responseEvent
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<any>}
 */
async function emitAndListen(socket, emitEvent, payload, responseEvent, timeoutMs = 3000) {
  const promise = waitForEvent(socket, responseEvent, timeoutMs);
  socket.emit(emitEvent, payload);
  return promise;
}

/**
 * Helper to close and cleanup array of socket instances.
 * @param {Array<object>} sockets
 */
function closeAllSockets(sockets = []) {
  for (const socket of sockets) {
    if (socket && typeof socket.disconnect === 'function') {
      socket.disconnect();
    }
  }
}

module.exports = {
  MockSocket,
  MockSocketHub,
  createTestSocket,
  waitForEvent,
  emitAndListen,
  closeAllSockets
};
