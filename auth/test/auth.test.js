const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { createApp } = require('../src/app');

// Throwaway key pair generated per test run: no key material in the repo.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const jwtConfig = { privateKey, publicKey, issuer: 'test-iss', audience: 'test-aud', ttlSeconds: 60 };

function fakeRepo({ dbDown = false } = {}) {
  const rows = new Map();
  return {
    rows,
    async findByUsername(u) {
      if (dbDown) throw new Error('ECONNREFUSED');
      return rows.get(u) || null;
    },
    async create() {},
    async ping() {
      if (dbDown) throw new Error('ECONNREFUSED');
    },
  };
}

const silent = pino({ level: 'silent' });

describe('auth service', () => {
  let app;
  before(async () => {
    const repo = fakeRepo();
    repo.rows.set('alice', {
      id: 7, username: 'alice', role: 'uploader', password_hash: await bcrypt.hash('correct-horse', 4),
    });
    app = createApp({ users: repo, jwtConfig, logger: silent, loginRateLimit: 1000 });
  });

  test('valid login returns an RS256 token with role claim', async () => {
    const res = await request(app).post('/login').send({ username: 'alice', password: 'correct-horse' });
    assert.equal(res.status, 200);
    const claims = jwt.verify(res.body.token, publicKey, { algorithms: ['RS256'], issuer: 'test-iss', audience: 'test-aud' });
    assert.equal(claims.sub, '7');
    assert.equal(claims.role, 'uploader');
  });

  test('wrong password and unknown user give the same 401', async () => {
    const a = await request(app).post('/login').send({ username: 'alice', password: 'wrong-password' });
    const b = await request(app).post('/login').send({ username: 'nobody', password: 'wrong-password' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  test('rejects invalid input', async () => {
    const res = await request(app).post('/login').send({ username: "a' OR 1=1 --", password: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.details.length, 2);
  });

  test('rejects malformed JSON', async () => {
    const res = await request(app).post('/login').set('content-type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
  });

  test('verify accepts a good token and rejects a tampered one', async () => {
    const { body } = await request(app).post('/login').send({ username: 'alice', password: 'correct-horse' });
    const ok = await request(app).get('/verify').set('authorization', `Bearer ${body.token}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.username, 'alice');

    const tampered = body.token.slice(0, -4) + 'AAAA';
    const bad = await request(app).get('/verify').set('authorization', `Bearer ${tampered}`);
    assert.equal(bad.status, 401);
  });

  test('verify rejects an HS256 token signed with the public key (alg confusion)', async () => {
    const forged = jwt.sign({ role: 'uploader' }, 'not-the-key', { algorithm: 'HS256', issuer: 'test-iss', audience: 'test-aud' });
    const res = await request(app).get('/verify').set('authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
  });

  test('health is 200 when DB is up', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
  });
});

describe('auth service with database down', () => {
  const app = createApp({ users: fakeRepo({ dbDown: true }), jwtConfig, logger: silent });

  test('health reports 503, liveness still 200', async () => {
    assert.equal((await request(app).get('/health')).status, 503);
    assert.equal((await request(app).get('/health/live')).status, 200);
  });

  test('login returns 503 instead of crashing', async () => {
    const res = await request(app).post('/login').send({ username: 'alice', password: 'correct-horse' });
    assert.equal(res.status, 503);
  });
});

describe('rate limiting', () => {
  test('blocks after the configured number of attempts', async () => {
    const app = createApp({ users: fakeRepo(), jwtConfig, logger: silent, loginRateLimit: 3 });
    const codes = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await request(app).post('/login').send({ username: 'bob', password: 'whatever1' })).status);
    }
    assert.deepEqual(codes, [401, 401, 401, 429]);
  });
});
