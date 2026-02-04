import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { app, setupApp, teardownApp, resetDb, seedBasic, prisma, s3Mock } from './testUtils.js';

async function login(role: 'student' | 'teacher') {
  const userId = role === 'student' ? 'student-1' : 'teacher-1';
  const issue = await request(app.server).post('/dev/issue').send({ userId, role });
  const session = await request(app.server).post('/auth/session').send({ code: issue.body.code, redirectUri: 'resonance://auth-callback' });
  return session.body.accessToken as string;
}

describe('media upload flow', () => {
  beforeAll(async () => {
    await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await resetDb();
    await seedBasic();
    s3Mock.reset();
  });

  it('presigns and confirms upload', async () => {
    const token = await login('student');

    const entry = await prisma.practiceEntry.create({
      data: {
        id: 'entry-1',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Practice',
        tags: ['tag'],
        status: 'draft'
      }
    });

    const artifactRes = await request(app.server)
      .post(`/entries/${entry.id}/artifacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'artifact-1', type: 'audio', durationSeconds: 60 });

    expect(artifactRes.status).toBe(200);

    const presignRes = await request(app.server)
      .post(`/artifacts/${artifactRes.body.id}/presign`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(presignRes.status).toBe(200);
    expect(presignRes.body.uploadUrl).toBeTruthy();

    s3Mock.on(HeadObjectCommand).resolves({});

    const confirmRes = await request(app.server)
      .post(`/artifacts/${artifactRes.body.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.uploadState).toBe('uploaded');
  });
});
