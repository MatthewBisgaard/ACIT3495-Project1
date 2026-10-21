# Storage Service

The File System Service. Saves video files to a persistent volume and streams
them back. It has no database: video metadata lives in MySQL and is managed by
the upload and streaming apps. This service only stores bytes, keyed by a UUID.

**Stack:** TypeScript, Express 5, Node streams

## Endpoints

Every `/files` endpoint requires `Authorization: Bearer <token>`, checked
against the auth service's `/verify`.

| Method | Path           | Purpose                                         |
|--------|----------------|-------------------------------------------------|
| PUT    | `/files/:key`  | Save a video (raw file as the request body)     |
| GET    | `/files/:key`  | Download/stream a video, supports Range         |
| DELETE | `/files/:key`  | Remove a video                                  |
| GET    | `/health`      | 200 if the video folder is writable, else 503   |

`:key` must be a lowercase UUID (e.g. `c5472d78-f51e-4b64-91f8-b711c35ab44b`).
The upload service generates it; storage never names files itself.

### PUT /files/:key

Headers: `Authorization`, `Content-Type: video/*`, `Content-Length`.
Body: the raw video bytes (not multipart).

| Status | Body                                      | When                              |
|--------|-------------------------------------------|-----------------------------------|
| 201    | `{ "key": "...", "size": 170251620 }`     | saved                             |
| 400    | `{ "error": "key must be a UUID" }`       | bad key (also blocks `../` paths) |
| 401    | `{ "error": "missing token" }` / `invalid token` | no or bad token            |
| 409    | `{ "error": "key already exists" }`       | key already used                  |
| 411    | `{ "error": "content-length required" }`  | no Content-Length                 |
| 413    | `{ "error": "file too large" }`           | over `MAX_UPLOAD_MB`              |
| 415    | `{ "error": "only video/* ..." }`         | wrong Content-Type                |
| 503    | `{ "error": "auth service unavailable" }` | auth is down                      |

The file is written to `<key>.part` first and renamed when complete, so an
interrupted upload never leaves a half file that could be streamed.

### GET /files/:key

| Status | When                                                   |
|--------|--------------------------------------------------------|
| 200    | full file                                              |
| 206    | `Range: bytes=start-end` request (used by video players to seek) |
| 404    | no file with that key                                  |

Responses are sent as `application/octet-stream`; the streaming app sets the
real content type from the metadata in MySQL.

### DELETE /files/:key

`204` on success, `404` if missing. Used by the upload app to clean up when
saving the metadata fails after the file was stored.

## Using it from another service

```ts
// upload: send the file
await fetch(`http://storage:3000/files/${key}`, {
  method: 'PUT',
  headers: {
    Authorization: req.headers.authorization!,
    'Content-Type': file.mimetype,
    'Content-Length': String(file.size),
  },
  body: fileStream,
  duplex: 'half', // required by Node's fetch when the body is a stream
});
```

## Configuration

Set in `docker-compose.yml`. No `.env` in this folder.

| Variable        | Default              | Purpose                        |
|-----------------|----------------------|--------------------------------|
| `AUTH_URL`      | `http://auth:3000`   | where tokens are verified      |
| `DATA_DIR`      | `/data/videos`       | where files are written        |
| `MAX_UPLOAD_MB` | `500`                | upload size limit              |
| `PORT`          | `3000`               | listen port                    |

## Persistence

`/data/videos` is the named volume `videos_data`, so files survive the container
being removed and recreated. The Dockerfile creates that folder owned by the
`node` user; without that, the non-root container could not write to the volume.

Check:

```bash
docker compose rm -sf storage && docker compose up -d storage
curl -s -o /dev/null -w '%{http_code}\n' localhost:3002/files/$KEY \
  -H "Authorization: Bearer $TOKEN" -H "Range: bytes=0-99"   # still 206
```

## Running

From the repo root:

```bash
docker compose up -d --build
docker compose logs storage   # "storage listening on 3000, saving to /data/videos"
```

Quick test (port 3002 is published for testing only):

```bash
TOKEN=$(curl -s -X POST localhost:3001/login -H "content-type: application/json" \
  -d '{"username":"alice","password":"Passw0rd123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
KEY=$(uuidgen | tr 'A-Z' 'a-z')

curl -X PUT localhost:3002/files/$KEY -H "Authorization: Bearer $TOKEN" \
  -H "content-type: video/mp4" --data-binary @"$HOME/Downloads/video.mp4"

curl -s -o /dev/null -D - localhost:3002/files/$KEY \
  -H "Authorization: Bearer $TOKEN" -H "Range: bytes=0-99" | head -1   # HTTP/1.1 206
```

## Failure behaviour

| Situation        | Result                                                     |
|------------------|------------------------------------------------------------|
| Auth down        | `/files` requests get 503 within 3s; `/health` stays 200   |
| Upload cut off   | `.part` file deleted, nothing streamable left behind       |
| Volume not writable | `/health` returns 503, Docker marks the container unhealthy |

## Files

| File            | Purpose                                         |
|-----------------|-------------------------------------------------|
| `src/index.ts`  | Express setup, creates the data folder, listen  |
| `src/routes.ts` | the four endpoints                              |
| `src/auth.ts`   | middleware that checks tokens with auth         |
| `Dockerfile`    | 2-stage Alpine build, non-root, owns `/data`    |

## Security notes

- Every file operation needs a valid token from the auth service.
- Keys must match a strict UUID pattern, which blocks path traversal.
- Only `video/*` uploads are accepted, with a size limit.
- Runs as the non-root `node` user; can only write inside `/data`.