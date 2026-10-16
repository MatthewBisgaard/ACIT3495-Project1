const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateCredentials } = require('./validate');

// A real hash of a random string. Used when the username doesn't exist so the
// response time is the same as a wrong password (prevents user enumeration).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 10);

function createApp({ users, jwtConfig, logger, loginRateLimit = 20 }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(
    pinoHttp({
      logger,
      // health checks every few seconds would drown the useful logs
      autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    }),
  );

  // Liveness: process is up. Does not touch the DB.
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

  // Readiness: can we actually serve logins? Used by the Docker healthcheck.
  app.get('/health', async (req, res) => {
    try {
      await users.ping();
      res.json({ status: 'ok', db: 'up' });
    } catch (err) {
      req.log.warn({ err: err.message }, 'health check: database unreachable');
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many login attempts, try again later' },
  });

  app.post('/login', loginLimiter, async (req, res) => {
    const errors = validateCredentials(req.body);
    if (errors.length) return res.status(400).json({ error: 'invalid input', details: errors });

    const { username, password } = req.body;
    let user;
    try {
      user = await users.findByUsername(username);
    } catch (err) {
      req.log.error({ err: err.message }, 'login: database error');
      return res.status(503).json({ error: 'authentication temporarily unavailable' });
    }

    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      req.log.info({ username }, 'login failed');
      return res.status(401).json({ error: 'invalid username or password' });
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      jwtConfig.privateKey,
      {
        algorithm: 'RS256',
        subject: String(user.id),
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        expiresIn: jwtConfig.ttlSeconds,
      },
    );
    req.log.info({ username, role: user.role }, 'login succeeded');
    res.json({ token, tokenType: 'Bearer', expiresIn: jwtConfig.ttlSeconds });
  });

  // Introspection endpoint. The other services verify tokens locally with the
  // public key, so this is for debugging and the demo, not the hot path.
  app.get('/verify', (req, res) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'missing bearer token' });
    try {
      const claims = jwt.verify(token, jwtConfig.publicKey, {
        algorithms: ['RS256'], // pin the algorithm: blocks alg=none / HS256 key confusion
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      });
      res.json({ valid: true, sub: claims.sub, username: claims.username, role: claims.role, exp: claims.exp });
    } catch (err) {
      res.status(401).json({ valid: false, error: err.message });
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Malformed JSON and anything unexpected end up here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
    req.log.error({ err: err.message }, 'unhandled error');
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
