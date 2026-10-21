import type { RequestHandler } from 'express';

export const AUTH_URL = process.env.AUTH_URL ?? 'http://auth:3000';

// The browser holds the JWT in an httpOnly cookie (JavaScript can't read it).
// Every protected request checks that token with the auth service.
export const requireLogin: RequestHandler = async (req, res, next) => {
  const token: string | undefined = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'not logged in' });
    return;
  }

  try {
    const r = await fetch(`${AUTH_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      res.clearCookie('token');
      res.status(401).json({ error: 'session expired, log in again' });
      return;
    }
    res.locals.user = (await r.json()).user; // { sub, username }
    res.locals.token = token; // forwarded to storage
    next();
  } catch {
    res.status(503).json({ error: 'auth service unavailable' });
  }
};