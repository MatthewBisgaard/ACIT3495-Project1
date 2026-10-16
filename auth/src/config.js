const fs = require('node:fs');

// Read a secret from FOO_FILE (Docker secret path) or fall back to FOO.
// Secrets are never logged.
function secret(name, { required = true } = {}) {
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  if (process.env[name]) return process.env[name];
  if (required) throw new Error(`Missing secret ${name} (set ${name}_FILE or ${name})`);
  return undefined;
}

function load() {
  return {
    port: Number(process.env.PORT || 3000),
    logLevel: process.env.LOG_LEVEL || 'info',
    db: {
      host: process.env.DB_HOST || 'mysql',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'auth_svc',
      password: secret('DB_PASSWORD'),
      database: process.env.DB_NAME || 'videodb',
      connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    },
    jwt: {
      privateKey: secret('JWT_PRIVATE_KEY'),
      publicKey: secret('JWT_PUBLIC_KEY'),
      issuer: process.env.JWT_ISSUER || 'acit3495-auth',
      audience: process.env.JWT_AUDIENCE || 'video-platform',
      ttlSeconds: Number(process.env.JWT_TTL_SECONDS || 3600),
    },
    loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 20), // attempts per minute per IP
  };
}

module.exports = { load, secret };
