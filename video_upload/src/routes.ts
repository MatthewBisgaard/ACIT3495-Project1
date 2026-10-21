import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { prisma } from './prisma.js';
import { AUTH_URL, requireLogin } from './auth.js';

const STORAGE_URL = process.env.STORAGE_URL ?? 'http://storage:3000';
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 500) * 1024 * 1024;

// Multer writes the incoming file to a temp file on disk, not into memory,
// so a 500 MB upload doesn't blow the container's memory limit.
const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('video/')),
});

const router = Router();

// ---- login / register: forwarded to the auth service ----

async function callAuth(path: string, body: unknown) {
  const r = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  return { status: r.status, data: await r.json() };
}

router.post('/api/register', async (req, res) => {
  try {
    const { status, data } = await callAuth('/register', req.body);
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'auth service unavailable' });
  }
});

router.post('/api/login', async (req, res) => {
  try {
    const { status, data } = await callAuth('/login', req.body);
    if (status !== 200) return void res.status(status).json(data);

    res.cookie('token', data.token, {
      httpOnly: true, // not readable by page JavaScript (XSS can't steal it)
      sameSite: 'strict', // not sent on requests from other sites (CSRF)
      maxAge: 60 * 60 * 1000, // same 1h lifetime as the JWT
    });
    res.json({ username: req.body.username });
  } catch {
    res.status(503).json({ error: 'auth service unavailable' });
  }
});

router.post('/api/logout', (_req, res) => {
  res.clearCookie('token');
  res.status(204).end();
});

router.get('/api/me', requireLogin, (_req, res) => {
  res.json({ username: res.locals.user.username });
});

// ---- videos ----

router.get('/api/videos', requireLogin, async (_req, res) => {
  const videos = await prisma.video.findMany({
    where: { userId: Number(res.locals.user.sub) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, size: true, createdAt: true },
  });
  res.json(videos);
});

// 1. save the file in storage under a new UUID
// 2. save the metadata in MySQL
// If step 2 fails, undo step 1 so storage never keeps orphaned files.
router.post('/api/upload', requireLogin, upload.single('video'), async (req, res) => {
  const file = req.file;
  if (!file) return void res.status(400).json({ error: 'choose a video file' });

  try {
    const title = String(req.body.title ?? '').trim();
    if (title.length < 1 || title.length > 120) {
      return void res.status(400).json({ error: 'title must be 1 to 120 characters' });
    }

    const key = randomUUID();
    const auth = { Authorization: `Bearer ${res.locals.token}` };

    let stored: Response;
    try {
      stored = await fetch(`${STORAGE_URL}/files/${key}`, {
        method: 'PUT',
        headers: auth,
        // a Blob backed by the temp file: streamed from disk, and fetch sets
        // Content-Type and Content-Length from it automatically
        body: await openAsBlob(file.path, { type: file.mimetype }),
      });
    } catch {
      return void res.status(503).json({ error: 'storage service unavailable' });
    }
    if (!stored.ok) {
      console.error(`storage rejected ${key}: ${stored.status} ${await stored.text()}`);
      return void res.status(502).json({ error: 'storage rejected the file' });
    }

    try {
      const video = await prisma.video.create({
        data: { title, storageKey: key, mimeType: file.mimetype, size: file.size, userId: Number(res.locals.user.sub) },
        select: { id: true, title: true },
      });
      console.log(`user ${res.locals.user.sub} uploaded video ${video.id} (${key}, ${file.size} bytes)`);
      res.status(201).json(video);
    } catch (err) {
      await fetch(`${STORAGE_URL}/files/${key}`, { method: 'DELETE', headers: auth }).catch(() => {});
      console.error(`metadata save failed, removed ${key} from storage`);
      throw err;
    }
  } finally {
    await rm(file.path, { force: true }); // always delete the temp file
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