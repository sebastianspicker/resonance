// Verifies auth session, refresh, and logout payload validation.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, installBasicSuite } from '../support/testUtils.js';

installBasicSuite();

describe('POST /auth/session', () => {
  it('rejects non-string code', async () => {
    const res = await request(app.server).post('/auth/session').send({ code: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing code', async () => {
    const res = await request(app.server).post('/auth/session').send({});
    expect(res.status).toBe(400);
  });

  it('rejects overly long code', async () => {
    const res = await request(app.server)
      .post('/auth/session')
      .send({ code: 'a'.repeat(2049) });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/refresh', () => {
  it('rejects non-string refreshToken', async () => {
    const res = await request(app.server).post('/auth/refresh').send({ refreshToken: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing refreshToken', async () => {
    const res = await request(app.server).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('rejects overly long refreshToken', async () => {
    const res = await request(app.server)
      .post('/auth/refresh')
      .send({ refreshToken: 'a'.repeat(2049) });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/logout', () => {
  it('rejects non-object bodies', async () => {
    const res = await request(app.server)
      .post('/auth/logout')
      .set('Content-Type', 'application/json')
      .send('"token"');
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-string refreshToken', async () => {
    const res = await request(app.server).post('/auth/logout').send({ refreshToken: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
