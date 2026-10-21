import type { RequestHandler } from 'express';

const AUTH_URL = process.env.AUTH_URL ?? 'http://auth:3000';

// Every request must carry a token that the auth service accepts.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ error: 'missing token' });
    return;
  }

  try {
    const r = await fetch(`${AUTH_URL}/verify`, {
      headers: { Authorization: header },
      signal: AbortSignal.timeout(3000), // don't hang if auth is down
    });
    if (!r.ok) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    res.locals.user = (await r.json()).user;
    next();
  } catch {
    res.status(503).json({ error: 'auth service unavailable' });
  }
};