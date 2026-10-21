# Video Upload Web App

The page where logged-in users upload videos. The browser talks only to this
service; this service talks to auth (login), storage (the file) and MySQL
(the metadata).

**Stack:** TypeScript, Express 5, Multer, Prisma 7 (MySQL via the mariadb adapter), plain HTML/JS

**Open:** http://localhost:8080

## How an upload works

```
browser ──multipart──▶ video_upload ──PUT raw file──▶ storage   (file saved as <uuid>)
                            │
                            └──prisma.video.create──▶ MySQL    (title, key, size, owner)
```

1. Multer receives the file and writes it to a temp file on disk (not memory).
2. A new UUID is generated and the file is sent to storage as `PUT /files/<uuid>`.
3. The metadata row is saved in MySQL with Prisma.
4. If step 3 fails, the file is deleted from storage again, so storage never
   keeps files with no database row.
5. The temp file is always deleted, success or failure.

## Endpoints

All `/api` responses are JSON. Protected routes need the `token` cookie set by `/api/login`.

| Method | Path            | Auth   | Purpose                                     |
|--------|-----------------|--------|---------------------------------------------|
| GET    | `/`             | none   | the upload page (`public/index.html`)       |
| POST   | `/api/register` | none   | create an account (forwarded to auth)       |
| POST   | `/api/login`    | none   | log in, sets the `token` cookie             |
| POST   | `/api/logout`   | none   | clears the cookie                           |
| GET    | `/api/me`       | cookie | `{ "username": "alice" }`                   |
| GET    | `/api/videos`   | cookie | the logged-in user's uploads, newest first  |
| POST   | `/api/upload`   | cookie | upload a video (multipart: `title`, `video`) |
| GET    | `/health`       | none   | 200 if MySQL answers, else 503              |

### POST /api/login

Body `{ "username": "...", "password": "..." }`. On success the JWT from auth is
stored in a cookie:

| Flag              | Why                                                    |
|-------------------|--------------------------------------------------------|
| `HttpOnly`        | page JavaScript can't read it, so XSS can't steal it   |
| `SameSite=Strict` | not sent on requests from other sites (blocks CSRF)    |
| `Max-Age=3600`    | expires with the JWT (1 hour)                          |

### POST /api/upload

Multipart form with fields `title` and `video`.

| Status | Body                                              | When                          |
|--------|---------------------------------------------------|-------------------------------|
| 201    | `{ "id": 1, "title": "My clip" }`                 | uploaded                      |
| 400    | `{ "error": "choose a video file" }`              | no file, or not `video/*`     |
| 400    | `{ "error": "title must be 1 to 120 characters" }` | bad title                    |
| 401    | `{ "error": "not logged in" }`                    | no or expired cookie          |
| 413    | `{ "error": "File too large" }`                   | over `MAX_UPLOAD_MB`          |
| 502    | `{ "error": "storage rejected the file" }`        | storage said no               |
| 503    | `{ "error": "storage service unavailable" }`      | storage down                  |
| 500    | `{ "error": "internal error" }`                   | MySQL failed (file is removed from storage) |

## Configuration

Set in `docker-compose.yml` from the root `.env`. No `.env` in this folder.

| Variable        | Default                | Purpose                     |
|-----------------|------------------------|-----------------------------|
| `DATABASE_URL`  | (required)             | MySQL connection            |
| `AUTH_URL`      | `http://auth:3000`     | login and token checks      |
| `STORAGE_URL`   | `http://storage:3000`  | where files are sent        |
| `MAX_UPLOAD_MB` | `500`                  | upload size limit           |
| `PORT`          | `3000`                 | listen port (8080 on host)  |

## Database

Uses the shared schema in `prisma/schema.prisma`, an **identical copy** of
`auth/prisma/schema.prisma`. Auth owns the schema and is the only service that
runs `prisma db push`; this service only runs `prisma generate` at build time.
If the schema changes, copy it here again.

Writes to the `Video` table:

| Column       | Example                                  |
|--------------|------------------------------------------|
| `id`         | `1`                                      |
| `title`      | `My clip`                                |
| `storageKey` | `05314507-5b84-4a5a-a06c-713a727a9dc4`   |
| `mimeType`   | `video/mp4`                              |
| `size`       | `170251620` (bytes)                      |
| `userId`     | `2` (from the verified JWT, never from the form) |
| `createdAt`  | upload time                              |

## Networks

On both `frontend` (port 8080 for browsers) and `backend` (to reach auth,
storage and MySQL). It is the only way in for uploads.

## Running

From the repo root:

```bash
cd video_upload && npm install && cd ..     # once, creates package-lock.json
docker compose up -d --build
docker compose logs video_upload            # "video_upload listening on 3000"
```

Open http://localhost:8080, register or log in, pick a title and a file, upload.
Check both halves:

```bash
docker compose exec storage ls -la /data/videos      # the file, named by UUID
docker compose logs video_upload | tail -1           # "user 2 uploaded video 1 (...)"
```

## Failure behaviour

| Situation       | Result                                                        |
|-----------------|---------------------------------------------------------------|
| Auth down       | login and every protected route return 503                    |
| Storage down    | upload returns 503, nothing saved in MySQL                    |
| MySQL down      | upload returns 500, file deleted from storage; `/health` 503  |
| Upload cut off  | temp file deleted, nothing saved anywhere                     |

## Files

| File                   | Purpose                                         |
|------------------------|-------------------------------------------------|
| `src/index.ts`         | Express setup, static page, error handler       |
| `src/routes.ts`        | login proxy, video list, upload flow            |
| `src/auth.ts`          | middleware: checks the cookie's token with auth |
| `src/prisma.ts`        | Prisma client connected to MySQL                |
| `prisma/schema.prisma` | shared schema (copy of auth's)                  |
| `public/index.html`    | login form, upload form with progress, list     |
| `Dockerfile`           | 2-stage: Debian build, Alpine runtime, non-root |

## Security notes

- The JWT lives in an `HttpOnly`, `SameSite=Strict` cookie, never in localStorage.
- The video owner comes from the verified token, not from anything the browser sends.
- Only `video/*` files are accepted, with a size limit; titles are length-checked.
- Titles are rendered with `textContent`, so a title like `<script>` stays plain text.
- Files are named by a server-generated UUID; the user's file name is never used on disk.
- Uploads are buffered on disk, so the 256 MB memory limit holds for large files.
- Runs as the non-root `node` user.