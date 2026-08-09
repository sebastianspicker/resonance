import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  app,
  createArtifactSession,
  createTestArtifact,
  createTestEntry,
  createTestFeedback,
  deleteEntry,
  getAccessToken,
  installBasicSuite,
  login,
  prisma,
  s3Mock,
} from '../support/testUtils.js';

function artifactSessionBody(operationId: string, entryId: string, artifactId: string) {
  return {
    operationId,
    entryId,
    artifactId,
    type: 'audio',
    durationSeconds: 10,
    sizeBytes: 1,
    baseVersion: 1,
  };
}

function expectNoS3Deletion() {
  expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
}

async function expectDeletedEntryAndArtifacts(
  entryId: string,
  artifactIds: string[],
  storageKeys: string[]
) {
  const [entryAfter, tombstone, deletionJobs, artifactsAfter, artifactFeedbackAfter] =
    await Promise.all([
      prisma.practiceEntry.findUnique({ where: { id: entryId } }),
      prisma.deletedEntryTombstone.findUnique({ where: { id: entryId } }),
      prisma.storageDeletionJob.findMany({ where: { entryId } }),
      Promise.all(artifactIds.map((id) => prisma.artifact.findUnique({ where: { id } }))),
      prisma.feedback.findMany({ where: { targetId: { in: artifactIds } } }),
    ]);

  expect(entryAfter).toBeNull();
  expect(tombstone).toMatchObject({ id: entryId });
  expect(deletionJobs.map((job) => job.storageKey).sort()).toEqual(storageKeys.sort());
  expect(artifactsAfter).toEqual(artifactIds.map(() => null));
  expect(artifactFeedbackAfter).toHaveLength(0);
}

describe('acl entry and artifact lifecycle', () => {
  installBasicSuite();

  it('hard deletes entry data, retains a minimal ID tombstone, and queues storage cleanup', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    const entry = await createTestEntry({
      id: 'entry-hard-delete',
      practiceDate: new Date(),
      goalText: 'Delete me',
      tags: ['tag'],
      status: 'draft',
    });
    const artifact = await createTestArtifact({
      id: 'artifact-hard-delete',
      entryId: entry.id,
      type: 'audio',
      durationSeconds: 10,
      uploadState: 'uploaded',
      storageKey: 'artifacts/entry-hard-delete/artifact-hard-delete',
    });
    await createTestFeedback({
      id: 'fb_entry_1',
      targetType: 'entry',
      targetId: entry.id,
      teacherId: 'teacher-1',
      status: 'ok',
      commentsText: 'Good job',
      markers: { create: [{ id: 'mk_entry_1', timeSeconds: 1, text: 'nice' }] },
    });
    await createTestFeedback({
      id: 'fb_artifact_1',
      targetType: 'artifact',
      targetId: artifact.id,
      teacherId: 'teacher-1',
      status: 'ok',
      commentsText: 'Nice sound',
      markers: { create: [{ id: 'mk_artifact_1', timeSeconds: 2, text: 'tone' }] },
    });

    const token = await login('student');
    const res = await deleteEntry(token, entry.id);

    expect(res.status).toBe(204);
    expectNoS3Deletion();
    const feedbackAfter = await prisma.feedback.findMany({ where: { targetId: entry.id } });
    const markerAfter = await prisma.marker.findUnique({ where: { id: 'mk_entry_1' } });
    await expectDeletedEntryAndArtifacts(entry.id, [artifact.id], [artifact.storageKey]);
    expect(feedbackAfter.length).toBe(0);
    expect(markerAfter).toBeNull();

    const staleRecreate = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: entry.id,
        practiceDate: entry.practiceDate.toISOString(),
        goalText: entry.goalText,
        tags: entry.tags,
      });
    expect(staleRecreate.status).toBe(410);
    expect(staleRecreate.body.error?.code).toBe('ENTRY_DELETED');
  });

  it('cascade delete handles multiple artifacts atomically (bug #20)', async () => {
    s3Mock.reset();
    const entry = await createTestEntry({
      id: 'entry-multi-artifact',
      practiceDate: new Date(),
      goalText: 'Multi artifact delete test',
      tags: [],
      status: 'draft',
    });
    const artifact1 = await createTestArtifact({
      id: 'artifact-multi-1',
      entryId: entry.id,
      type: 'audio',
      durationSeconds: 10,
      uploadState: 'uploaded',
      storageKey: 'artifacts/entry-multi-artifact/artifact-multi-1',
    });
    const artifact2 = await createTestArtifact({
      id: 'artifact-multi-2',
      entryId: entry.id,
      type: 'video',
      durationSeconds: 20,
      uploadState: 'uploaded',
      storageKey: 'artifacts/entry-multi-artifact/artifact-multi-2',
    });
    await createTestFeedback({
      id: 'fb_multi_1',
      targetType: 'artifact',
      targetId: artifact1.id,
      teacherId: 'teacher-1',
      status: 'ok',
      commentsText: 'Feedback on artifact 1',
    });
    await createTestFeedback({
      id: 'fb_multi_2',
      targetType: 'artifact',
      targetId: artifact2.id,
      teacherId: 'teacher-1',
      status: 'needs_revision',
      commentsText: 'Feedback on artifact 2',
    });

    const token = await login('student');
    const res = await deleteEntry(token, entry.id);

    expect(res.status).toBe(204);
    expectNoS3Deletion();
    await expectDeletedEntryAndArtifacts(
      entry.id,
      [artifact1.id, artifact2.id],
      [artifact1.storageKey, artifact2.storageKey]
    );
  });

  it('uses course role (not global role) for submit authorization', async () => {
    const mixedUser = await prisma.user.create({
      data: { id: 'mixed-role-user', displayName: 'Mixed Role', globalRole: 'teacher' },
    });
    await prisma.membership.create({
      data: { userId: mixedUser.id, courseId: 'COURSE_TEST', roleInCourse: 'student' },
    });
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-mixed-role',
        courseId: 'COURSE_TEST',
        studentId: mixedUser.id,
        practiceDate: new Date(),
        goalText: 'Submit me',
        tags: ['tag'],
        status: 'draft',
      },
    });
    await prisma.artifact.create({
      data: {
        id: 'artifact-mixed-role',
        entryId: 'entry-mixed-role',
        type: 'audio',
        durationSeconds: 15,
        uploadState: 'uploaded',
        storageKey: 'artifacts/entry-mixed-role/artifact-mixed-role',
      },
    });

    const token = await getAccessToken('teacher', { userId: mixedUser.id });
    const res = await request(app.server)
      .post('/entries/entry-mixed-role/submit')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
  });

  it('rejects invalid artifact type', async () => {
    const entry = await createTestEntry({
      id: 'entry-bad-artifact',
      practiceDate: new Date(),
      goalText: 'Invalid artifact',
      tags: ['tag'],
      status: 'draft',
    });
    const token = await login('student');
    const res = await createArtifactSession(token, {
      operationId: 'bad-artifact-operation',
      entryId: entry.id,
      artifactId: 'artifact-bad',
      type: 'image',
      durationSeconds: 5,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(400);
  });

  it('rejects artifact creation on submitted entries', async () => {
    const entry = await createTestEntry({
      id: 'entry-submitted-no-artifact',
      practiceDate: new Date(),
      goalText: 'Already submitted',
      tags: ['tag'],
      status: 'submitted',
    });
    const token = await login('student');
    const res = await createArtifactSession(
      token,
      artifactSessionBody('submitted-artifact-operation', entry.id, 'artifact-blocked')
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_LOCKED');
  });

  it('rejects artifact creation on reviewed entries', async () => {
    const entry = await createTestEntry({
      id: 'entry-reviewed-no-artifact',
      practiceDate: new Date(),
      goalText: 'Already reviewed',
      tags: ['tag'],
      status: 'reviewed',
    });
    const token = await login('student');
    const res = await createArtifactSession(
      token,
      artifactSessionBody('reviewed-artifact-operation', entry.id, 'artifact-blocked-2')
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTRY_LOCKED');
  });

  it('allows artifact creation on draft entries', async () => {
    const entry = await createTestEntry({
      id: 'entry-draft-artifact-ok',
      practiceDate: new Date(),
      goalText: 'Draft entry',
      tags: ['tag'],
      status: 'draft',
    });
    const token = await login('student');
    const res = await createArtifactSession(token, {
      operationId: 'draft-artifact-operation',
      entryId: entry.id,
      artifactId: 'artifact-allowed',
      type: 'audio',
      durationSeconds: 10,
      sizeBytes: 1,
      baseVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.artifact.id).toBe('artifact-allowed');
  });
});
