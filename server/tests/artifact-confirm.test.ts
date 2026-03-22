import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  app,
  setupApp,
  teardownApp,
  resetDb,
  seedBasic,
  getAccessToken,
  prisma,
  s3Mock,
} from './testUtils.js';

/**
 * Tests for artifacts.ts confirm branches:
 * - Artifact confirm when S3 HeadObject fails (file not uploaded)
 * - Artifact confirm when artifact has no storage key
 */

function login(role: 'student' | 'teacher') {
  const userId = role === 'student' ? 'student-1' : 'teacher-1';
  return getAccessToken(role, { userId });
}

describe('artifact confirm edge cases', () => {
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

  it('returns 400 MISSING_STORAGE_KEY when artifact has no storageKey', async () => {
    const token = await login('student');

    // Create entry and artifact directly in DB without storageKey
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-no-key',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Test',
        tags: ['tag'],
        status: 'draft',
      },
    });

    await prisma.artifact.create({
      data: {
        id: 'artifact-no-key',
        entryId: 'entry-no-key',
        type: 'audio',
        durationSeconds: 60,
        uploadState: 'pending',
        storageKey: null, // explicitly no storage key
      },
    });

    const res = await request(app.server)
      .post('/artifacts/artifact-no-key/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_STORAGE_KEY');
    expect(res.body.error.message).toBe('Artifact missing storage key');
  });

  it('returns 409 UPLOAD_INVALID when S3 HeadObject fails', async () => {
    const token = await login('student');

    // Create entry and artifact with storageKey
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-s3-fail',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Test',
        tags: ['tag'],
        status: 'draft',
      },
    });

    await prisma.artifact.create({
      data: {
        id: 'artifact-s3-fail',
        entryId: 'entry-s3-fail',
        type: 'audio',
        durationSeconds: 60,
        uploadState: 'uploading',
        storageKey: 'artifacts/entry-s3-fail/artifact-s3-fail',
      },
    });

    // Mock S3 HeadObject to fail (file not uploaded)
    s3Mock.on(HeadObjectCommand).rejects(
      Object.assign(new Error('Not Found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
    );

    const res = await request(app.server)
      .post('/artifacts/artifact-s3-fail/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UPLOAD_INVALID');
    expect(res.body.error.message).toBe('Upload not found in storage');
  });

  it('returns 409 UPLOAD_INVALID when uploaded file is empty (ContentLength 0)', async () => {
    const token = await login('student');

    await prisma.practiceEntry.create({
      data: {
        id: 'entry-empty-file',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Test',
        tags: ['tag'],
        status: 'draft',
      },
    });

    await prisma.artifact.create({
      data: {
        id: 'artifact-empty-file',
        entryId: 'entry-empty-file',
        type: 'audio',
        durationSeconds: 60,
        uploadState: 'uploading',
        storageKey: 'artifacts/entry-empty-file/artifact-empty-file',
      },
    });

    // Mock S3 HeadObject to return 0 ContentLength
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 0 });

    const res = await request(app.server)
      .post('/artifacts/artifact-empty-file/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UPLOAD_INVALID');
    expect(res.body.error.message).toBe('Uploaded file is empty');
  });

  it('returns 404 when confirming a non-existent artifact', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/artifacts/non-existent-artifact/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ARTIFACT_NOT_FOUND');
  });
});
