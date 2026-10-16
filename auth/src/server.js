const { load } = require('./config');
const { createLogger } = require('./logger');
const { createUserRepo } = require('./db');
const { createApp } = require('./app');

const config = load();
const logger = createLogger(config.logLevel);
const users = createUserRepo(config.db);
const app = createApp({ users, jwtConfig: config.jwt, logger, loginRateLimit: config.loginRateLimit });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, dbHost: config.db.host }, 'auth service listening');
});

// Graceful shutdown: docker stop sends SIGTERM, we finish in-flight requests,
// close the pool, then exit before Docker's 10s SIGKILL.
function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await users.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
