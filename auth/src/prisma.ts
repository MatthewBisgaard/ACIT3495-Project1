import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';

// DATABASE_URL looks like mysql://user:pass@mysql:3306/videodb
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const url = new URL(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  allowPublicKeyRetrieval: true, // needed for MySQL 8 logins without TLS
  connectTimeout: 2000, // fail fast if MySQL is down instead of hanging
  acquireTimeout: 2000,
});

export const prisma = new PrismaClient({ adapter });