'use strict';

const net = require('net');

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** Ask the OS for any free loopback port. */
function getEphemeralPort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ port: 0, host, exclusive: true }, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Return `preferred` when it is free, otherwise any free port. */
async function pickPort(preferred) {
  if (await isPortFree(preferred)) return preferred;
  return getEphemeralPort();
}

module.exports = { isPortFree, getEphemeralPort, pickPort };
