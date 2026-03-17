// @tier: community
'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/security');
const { log } = require('../utils/logger');
const pool = require('../config/database');

let io = null;
let onlineUsers = new Map(); // userId -> Set of socketIds
let redisAdapterStatus = {
  required: false,
  configured: false,
  mode: 'in-memory',
  status: 'disabled',
  error: null
};
let fatalExitScheduled = false;

function parseBooleanFlag(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function updateRedisAdapterStatus(nextState = {}) {
  redisAdapterStatus = {
    ...redisAdapterStatus,
    ...nextState
  };
}

function scheduleFatalExit(reason, error) {
  if (fatalExitScheduled) return;
  fatalExitScheduled = true;

  log('error', 'websocket.redis.required_unmet', {
    reason,
    ...(error ? { error } : {})
  });

  setImmediate(() => process.exit(1));
}

/**
 * Initialize Socket.IO server with Express HTTP server
 * @param {http.Server} httpServer - Express HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
function initializeWebSocket(httpServer) {
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
  const redisRequired = parseBooleanFlag(process.env.REDIS_REQUIRED, false);
  const redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
  const defaultStatus = redisConfigured
    ? 'connecting'
    : (redisRequired ? 'required_missing' : 'disabled');

  updateRedisAdapterStatus({
    required: redisRequired,
    configured: redisConfigured,
    mode: 'in-memory',
    status: defaultStatus,
    error: null
  });

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Setup Redis adapter if Redis URL is configured
  if (redisConfigured) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');

      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

      const redisConfig = process.env.REDIS_URL
        ? { url: process.env.REDIS_URL }
        : {
            socket: {
              host: process.env.REDIS_HOST || 'localhost',
              port: Number.isNaN(redisPort) ? 6379 : redisPort
            },
            password: process.env.REDIS_PASSWORD || undefined,
            database: Number.isNaN(redisDb) ? 0 : redisDb
          };

      const pubClient = createClient(redisConfig);
      const subClient = pubClient.duplicate();

      Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        updateRedisAdapterStatus({
          mode: 'redis',
          status: 'connected',
          error: null
        });

        log('info', 'websocket.redis.connected', {
          message: 'Redis adapter enabled for multi-instance scaling'
        });
      }).catch((error) => {
        updateRedisAdapterStatus({
          mode: 'in-memory',
          status: 'failed',
          error: error.message
        });

        if (redisRequired) {
          log('error', 'websocket.redis.failed', {
            error: error.message,
            message: 'Redis adapter connection failed with REDIS_REQUIRED=true; terminating process'
          });
          scheduleFatalExit('connection_failed', error.message);
          return;
        }

        log('warn', 'websocket.redis.failed', {
          error: error.message,
          message: 'Falling back to in-memory adapter'
        });
      });
    } catch (error) {
      updateRedisAdapterStatus({
        mode: 'in-memory',
        status: 'failed',
        error: error.message
      });

      if (redisRequired) {
        log('error', 'websocket.redis.unavailable', {
          error: error.message,
          message: 'Redis adapter unavailable with REDIS_REQUIRED=true; terminating process'
        });
        scheduleFatalExit('adapter_unavailable', error.message);
        return io;
      }

      log('warn', 'websocket.redis.unavailable', {
        error: error.message,
        message: 'Redis adapter not available, using in-memory adapter'
      });
    }
  } else {
    if (redisRequired) {
      log('error', 'websocket.redis.missing_config', {
        message: 'REDIS_REQUIRED=true but no REDIS_URL/REDIS_HOST configured; terminating process'
      });
      scheduleFatalExit('missing_configuration');
      return io;
    }

    log('info', 'websocket.redis.disabled', {
      message: 'Redis not configured, using in-memory adapter (single instance only)'
    });
  }

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Fetch user from database
      const userResult = await pool.query(
        'SELECT id, email, organization_id, role FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return next(new Error('User not found'));
      }

      socket.user = userResult.rows[0];
      next();
    } catch (error) {
      log('warn', 'websocket.auth.failed', { error: error.message });
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const organizationId = socket.user.organization_id;

    log('info', 'websocket.connected', {
      userId,
      organizationId,
      socketId: socket.id
    });

    // Track online user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Join organization room
    socket.join(`org:${organizationId}`);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Emit user online event to organization
    socket.to(`org:${organizationId}`).emit('user.online', {
      userId,
      email: socket.user.email,
      timestamp: new Date().toISOString()
    });

    // Send online users count to the connected user
    const orgOnlineCount = getOrganizationOnlineCount(organizationId);
    socket.emit('presence.update', {
      organizationOnlineCount: orgOnlineCount
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      log('info', 'websocket.disconnected', {
        userId,
        organizationId,
        socketId: socket.id
      });

      // Remove from online users
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          // Emit user offline event to organization
          socket.to(`org:${organizationId}`).emit('user.offline', {
            userId,
            email: socket.user.email,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // Handle client ping (for keepalive)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Handle typing indicator (optional feature)
    socket.on('typing.start', (data) => {
      socket.to(`org:${organizationId}`).emit('typing.start', {
        userId,
        email: socket.user.email,
        context: data.context
      });
    });

    socket.on('typing.stop', (data) => {
      socket.to(`org:${organizationId}`).emit('typing.stop', {
        userId,
        context: data.context
      });
    });
  });

  log('info', 'websocket.initialized', {
    path: '/socket.io/',
    cors: corsOrigins
  });

  return io;
}

/**
 * Get count of online users in an organization
 * @param {string} organizationId - Organization UUID
 * @returns {number} Count of online users
 */
function getOrganizationOnlineCount(organizationId) {
  let count = 0;

  if (!io) return count;

  const room = io.sockets.adapter.rooms.get(`org:${organizationId}`);
  if (room) {
    count = room.size;
  }

  return count;
}

/**
 * Get Socket.IO server instance
 * @returns {Server|null} Socket.IO server instance
 */
function getIO() {
  if (!io) {
    log('warn', 'websocket.not_initialized', {
      message: 'WebSocket server not initialized. Call initializeWebSocket() first.'
    });
  }
  return io;
}

/**
 * Emit event to a specific user
 * @param {string} userId - User UUID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function emitToUser(userId, event, data) {
  if (!io) return;

  io.to(`user:${userId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit event to all users in an organization
 * @param {string} organizationId - Organization UUID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function emitToOrganization(organizationId, event, data) {
  if (!io) return;

  io.to(`org:${organizationId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Broadcast event to all connected users
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function broadcast(event, data) {
  if (!io) return;

  io.emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Check if a user is currently online
 * @param {string} userId - User UUID
 * @returns {boolean} True if user is online
 */
function isUserOnline(userId) {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}

/**
 * Get list of online user IDs
 * @returns {string[]} Array of user IDs
 */
function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}

/**
 * Get Redis adapter status for observability and health endpoints
 * @returns {{required: boolean, configured: boolean, mode: string, status: string, error: string|null}}
 */
function getRedisAdapterStatus() {
  return { ...redisAdapterStatus };
}

module.exports = {
  initializeWebSocket,
  getIO,
  emitToUser,
  emitToOrganization,
  broadcast,
  isUserOnline,
  getOnlineUserIds,
  getOrganizationOnlineCount,
  getRedisAdapterStatus
};
