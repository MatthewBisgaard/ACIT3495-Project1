const pino = require('pino');

// JSON logs to stdout (docker logs collects them). Anything that could carry a
// credential is redacted before it is written.
function createLogger(level = 'info') {
  return pino({
    level,
    base: { service: 'auth' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
        'token',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  });
}

module.exports = { createLogger };
