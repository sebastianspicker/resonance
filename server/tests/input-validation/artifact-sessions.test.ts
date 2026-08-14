// Verifies artifact-session input validation before upload state changes run.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, installBasicSuite, login, prisma } from '../support/testUtils.js';

function postArtifactSession(token: string, body: Record<string, unknown>) {
  return request(app.server)
    .post('/api/v1/artifact-sessions')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

type UploadSizeValidationResponse = {
  status: number;
  body: {
    error?: { code?: string };
    artifact?: { expectedSizeBytes?: number };
    expectedSizeBytes?: number;
  };
};

async function expectUploadSizeValidation(
  submit: (artifactId: string, sizeBytes?: number) => Promise<UploadSizeValidationResponse>,
  successStatus: number,
  expectedSize: (body: UploadSizeValidationResponse['body']) => number | undefined
) {
  for (const [artifactId, sizeBytes] of [
    ['artifact-size-zero', 0],
    ['artifact-size-decimal', 1.5],
    ['artifact-size-too-large', 104_857_601],
  ] as const) {
    const response = await submit(artifactId, sizeBytes);
    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
  }

  const missing = await submit('artifact-size-missing');
  expect(missing.status).toBe(400);
  expect(missing.body.error?.code).toBe('VALIDATION_ERROR');

  const boundary = await submit('artifact-size-boundary', 104_857_600);
  expect(boundary.status).toBe(successStatus);
  expect(expectedSize(boundary.body)).toBe(104_857_600);
}

installBasicSuite();

describe('POST /api/v1/artifact-sessions', () => {
  let entryId: string;

  beforeEach(async () => {
    entryId = 'entry-artifact-val';
    await prisma.practiceEntry.create({
      data: {
        id: entryId,
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Artifact test',
        tags: ['tag'],
        status: 'draft',
      },
    });
  });

  it('rejects durationSeconds exceeding upper bound', async () => {
    const token = await login('student');
    const res = await postArtifactSession(token, {
      operationId: 'operation-dur-high',
      entryId,
      artifactId: 'artifact-dur-high',
      type: 'audio',
      durationSeconds: 50000,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('accepts durationSeconds at upper bound', async () => {
    const token = await login('student');
    const res = await postArtifactSession(token, {
      operationId: 'operation-dur-ok',
      entryId,
      artifactId: 'artifact-dur-ok',
      type: 'audio',
      durationSeconds: 28800,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.artifact.durationSeconds).toBe(28800);
  });

  it('accepts video artifact writes', async () => {
    const token = await login('student');
    const res = await postArtifactSession(token, {
      operationId: 'operation-video-accepted',
      entryId,
      artifactId: 'artifact-video-accepted',
      type: 'video',
      durationSeconds: 60,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.artifact.type).toBe('video');
  });

  it('requires a positive integer upload size within the configured limit', async () => {
    const token = await login('student');
    await expectUploadSizeValidation(
      async (artifactId, sizeBytes) =>
        postArtifactSession(token, {
          operationId: `operation-${artifactId}`,
          entryId,
          artifactId,
          type: 'audio',
          durationSeconds: 60,
          ...(sizeBytes === undefined ? {} : { sizeBytes }),
          baseVersion: 1,
        }),
      200,
      (body) => body.artifact.expectedSizeBytes
    );
  });

  it('rejects negative durationSeconds', async () => {
    const token = await login('student');
    const res = await postArtifactSession(token, {
      operationId: 'operation-neg',
      entryId,
      artifactId: 'artifact-neg',
      type: 'audio',
      durationSeconds: -5,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(400);
  });

  it('rejects decimal durationSeconds', async () => {
    const token = await login('student');
    const res = await postArtifactSession(token, {
      operationId: 'operation-decimal',
      entryId,
      artifactId: 'artifact-decimal',
      type: 'audio',
      durationSeconds: 12.25,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
