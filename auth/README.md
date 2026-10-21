# Auth Service

Registers users, logs them in, and issues JWTs. Other services call `/verify`
to check a token before allowing an upload or a stream.

**Stack:** TypeScript, Express 5, Prisma 7 (MySQL via the mariadb adapter), bcryptjs, jsonwebtoken

## Endpoints

| Method | Path        | Auth           | Purpose                              |
|--------|-------------|----------------|--------------------------------------|
| POST   | `/register` | none           | Create a user                        |
| POST   | `/login`    | none           | Get a JWT                            |
| GET    | `/verify`   | Bearer token   | Check a token (used by other services) |
| GET    | `/health`   | none           | 200 if MySQL is reachable, else 503  |

### POST /register

```json
{ "username": "alice", "password": "Passw0rd123" }
```

| Status | Body                                   | When                        |
|--------|----------------------------------------|-----------------------------|
| 201    | `{ "id": 1, "username": "alice" }`     | created                     |
| 400    | `{ "error": "..." }`                   | invalid username/password   |
| 409    | `{ "error": "username taken" }`        | username exists             |

Rules: username 3 to 32 chars (letters, digits, `_`); password 8 to 72 chars
(72 is bcrypt's limit).

### POST /login

Same body as `/register`.

| Status | Body                                            |
|--------|-------------------------------------------------|
| 200    | `{ "token": "eyJhbGciOi..." }`                  |
| 400    | `{ "error": "invalid input" }`                  |
| 401    | `{ "error": "invalid username or password" }`   |

The token is an HS256 JWT valid for 1 hour, with payload
`{ "sub": "<user id>", "username": "<username>" }`.

### GET /verify

Header: `Authorization: Bearer <token>`

| Status | Body                                                        |
|--------|-------------------------------------------------------------|
| 200    | `{ "valid": true, "user": { "sub": "1", "username": "alice", "iat": ..., "exp": ... } }` |
| 401    | `{ "error": "missing token" }` or `{ "valid": false, "error": "invalid or expired token" }` |

### GET /health

`200 { "status": "ok" }` or `503 { "status": "database unavailable" }`.
Docker's healthcheck calls this every 10s.

## Using it from another service

Forward the user's token and trust the result only on a 200:

```ts
const r = await fetch('http://auth:3000/verify', {
  headers: { Authorization: req.headers.authorization ?? '' },
});
if (!r.ok) return res.status(401).json({ error: 'unauthorized' });
const { user } = await r.json(); // user.sub = user id
```

## Configuration

Set by `docker-compose.yml` from the root `.env`. There is no `.env` in this folder.

| Variable       | Example                                        |
|----------------|------------------------------------------------|
| `DATABASE_URL` | `mysql://app:secret@mysql:3306/videodb`        |
| `JWT_SECRET`   | long random string, shared with nothing public |
| `PORT`         | `3000` (default)                               |

The service refuses to start if `DATABASE_URL` or `JWT_SECRET` is missing.

## Data model

`prisma/schema.prisma`, one table:

| Column      | Type         | Notes                    |
|-------------|--------------|--------------------------|
| `id`        | int, PK      | auto increment           |
| `username`  | varchar(32)  | unique                   |
| `password`  | varchar(100) | bcrypt hash, never plain |
| `createdAt` | datetime     | default now              |

No SQL files: the container runs `prisma db push` on start, which creates or
updates the table to match the schema.

## Running

From the repo root:

```bash
cp .env.example .env        # then edit the values
docker compose up -d --build
docker compose logs auth    # should end with "auth listening on 3000"
```

Quick test (port 3001 is published for testing only):

```bash
curl -X POST localhost:3001/register -H "content-type: application/json" \
  -d '{"username":"alice","password":"Passw0rd123"}'
curl -X POST localhost:3001/login -H "content-type: application/json" \
  -d '{"username":"alice","password":"Passw0rd123"}'
```

## Files

| File                 | Purpose                                      |
|----------------------|----------------------------------------------|
| `src/index.ts`       | Express setup, error handler, listen         |
| `src/routes.ts`      | the four endpoints                           |
| `src/prisma.ts`      | Prisma client connected to MySQL             |
| `prisma/schema.prisma` | User model                                 |
| `prisma.config.ts`   | tells Prisma CLI where the DB is             |
| `Dockerfile`         | 2-stage build: compile TS, then slim runtime |

## Security notes

- Passwords are hashed with bcrypt (cost 10); plain passwords are never stored or logged.
- Login gives the same error for "no such user" and "wrong password".
- `jwt.verify` is pinned to HS256, so tokens with `alg: none` or another algorithm are rejected.
- The container runs as the non-root `node` user.
- Secrets come from environment variables, never from the code or the image.