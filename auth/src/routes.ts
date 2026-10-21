import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
const JWT_SECRET = process.env.JWT_SECRET;
const router = Router();

function validCredentials(username: unknown, password: unknown) {
  return (
    typeof username === 'string' && /^[a-zA-Z0-9_]{3,32}$/.test(username) &&
    typeof password === 'string' && password.length >= 8 && password.length <= 72
  );
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!validCredentials(username, password)) {
    return res.status(400).json({ error: 'username 3-32 letters/digits/_, password 8-72 chars' });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: 'username taken' });

  const user = await prisma.user.create({
    data: { username, password: await bcrypt.hash(password, 10) },
  });
  res.status(201).json({ id: user.id, username: user.username });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!validCredentials(username, password)) {
    return res.status(400).json({ error: 'invalid input' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'invalid username or password' });
  }

  const token = jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, {
    expiresIn: '1h',
  });
  res.json({ token });
});

// Other services call this to check a token: GET /verify  Authorization: Bearer <token>
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    res.json({ valid: true, user: payload });
  } catch {
    res.status(401).json({ valid: false, error: 'invalid or expired token' });
  }
});

router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

export default router;