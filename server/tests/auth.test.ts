import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, setupApp, teardownApp, resetDb, seedBasic } from './testUtils.js';

async function getAccessToken(role: 'student' | 'teacher') {
  const issue = await request(app.server).post('/dev/issue').send({ role });
  const code = issue.body.code;
  const session = await request(app.server).post('/auth/session').send({ code, redirectUri: 'resonance://auth-callback' });
  return session.body.accessToken as string;
}

describe('auth', () => {
  beforeAll(async () => {
    await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await resetDb();
    await seedBasic();
  });

  it('exchanges dev code for tokens', async () => {
    const issue = await request(app.server).post('/dev/issue').send({ role: 'student' });
    expect(issue.status).toBe(200);

    const session = await request(app.server).post('/auth/session').send({
      code: issue.body.code,
      redirectUri: 'resonance://auth-callback'
    });

    expect(session.status).toBe(200);
    expect(session.body.accessToken).toBeTruthy();
    expect(session.body.refreshToken).toBeTruthy();
  });

  it('allows authenticated course listing', async () => {
    const token = await getAccessToken('student');
    const res = await request(app.server)
      .get('/courses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('rotates refresh tokens and revokes the old token', async () => {
    const issue = await request(app.server).post('/dev/issue').send({ role: 'student' });
    const session = await request(app.server).post('/auth/session').send({
      code: issue.body.code,
      redirectUri: 'resonance://auth-callback'
    });

    const refreshToken = session.body.refreshToken as string;
    const refreshed = await request(app.server).post('/auth/refresh').send({ refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app.server).post('/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error?.code).toBe('REFRESH_REVOKED');
  });

  it('rejects invalid refresh tokens', async () => {
    const res = await request(app.server).post('/auth/refresh').send({ refreshToken: 'not-a-token' });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_REFRESH');
  });
});
