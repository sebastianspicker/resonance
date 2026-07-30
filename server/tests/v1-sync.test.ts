// Exercises the v1 FIFO command contract, optimistic versions, replay, and result envelopes.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  getAccessToken,
  prisma,
  resetDb,
  seedBasic,
  setupApp,
  teardownApp,
} from './support/testUtils.js';

describe('v1 sync command receipts and versions', () => {
  let studentToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    await setupApp();
  });
  beforeEach(async () => {
    await resetDb();
    await seedBasic();
    studentToken = await getAccessToken('student', { userId: 'student-1' });
    teacherToken = await getAccessToken('teacher', { userId: 'teacher-1' });
  });
  afterAll(teardownApp);

  const create = (operationId = 'v1-create-1') => ({
    operationId,
    entityId: 'v1-entry-1',
    kind: 'createEntry',
    payload: {
      courseId: 'COURSE_TEST',
      kind: 'practice',
      practiceDate: '2026-07-16',
      goalText: 'Keep a steady pulse',
      tags: [],
    },
  });

  const execute = (token: string, commands: Array<Record<string, unknown>>) =>
    request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${token}`)
      .send({ commands });

  it('returns a duplicate receipt without applying the create twice', async () => {
    const first = await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create()] });
    const retry = await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create()] });
    expect(first.status).toBe(200);
    expect(first.body.results[0]).toMatchObject({ status: 'applied', currentVersion: 1 });
    expect(retry.status).toBe(200);
    expect(retry.body.results[0]).toMatchObject({ status: 'duplicate', currentVersion: 1 });
  });

  it('does not replay an entry resource after membership is revoked', async () => {
    await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create('v1-revoked-replay')] });
    await prisma.membership.delete({
      where: { userId_courseId: { userId: 'student-1', courseId: 'COURSE_TEST' } },
    });

    const replay = await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create('v1-revoked-replay')] });

    expect(replay.status).toBe(200);
    expect(replay.body.results[0]).toMatchObject({ status: 'rejected', code: 'STUDENT_ONLY' });
    expect(replay.body.results[0].resource).toBeUndefined();
  });

  it('rejects reuse of an operation ID with changed content', async () => {
    await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create()] });
    const reused = create();
    reused.payload.goalText = 'Different intent';
    const response = await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [reused] });
    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'OPERATION_REUSED',
    });
  });

  it('returns the current resource for an optimistic-version conflict', async () => {
    await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ commands: [create()] });
    const response = await request(app.server)
      .post('/api/v1/sync/commands')
      .set('authorization', `Bearer ${studentToken}`)
      .send({
        commands: [
          {
            operationId: 'v1-update-stale',
            entityId: 'v1-entry-1',
            kind: 'updateEntry',
            baseVersion: 9,
            payload: { goalText: 'Stale' },
          },
        ],
      });
    expect(response.body.results[0]).toMatchObject({
      status: 'conflict',
      code: 'VERSION_CONFLICT',
      currentVersion: 1,
    });
  });

  it('applies the teaching-lesson command lifecycle through reviewed feedback', async () => {
    const entryId = 'v1-teaching-entry';
    const artifactId = 'v1-teaching-video';

    const created = await execute(studentToken, [
      {
        operationId: 'v1-teaching-create',
        entityId: entryId,
        kind: 'createEntry',
        payload: {
          courseId: 'COURSE_TEST',
          kind: 'teaching_lesson',
          practiceDate: '2026-07-21T09:30:00.000Z',
          goalText: 'Model a steady call-and-response pulse',
          durationSeconds: 600,
          tags: ['teaching', 'rhythm'],
          notes: 'Start with a short modeled phrase.',
          consentConfirmedAt: '2026-07-21T09:00:00.000Z',
          consentScope: 'private_course_review',
          captureProfile: 'teacher_learner',
        },
      },
    ]);
    expect(created.body.results[0]).toMatchObject({
      status: 'applied',
      currentVersion: 1,
      resource: { id: entryId, kind: 'teaching_lesson', status: 'draft' },
    });

    const updated = await execute(studentToken, [
      {
        operationId: 'v1-teaching-update',
        entityId: entryId,
        kind: 'updateEntry',
        baseVersion: 1,
        payload: {
          goalText: 'Model and then vary a call-and-response pulse',
          notes: 'Leave room for the student response.',
          tags: ['teaching', 'rhythm', 'reflection'],
        },
      },
    ]);
    expect(updated.body.results[0]).toMatchObject({ status: 'applied', currentVersion: 2 });

    await prisma.artifact.create({
      data: {
        id: artifactId,
        entryId,
        type: 'video',
        durationSeconds: 90,
        uploadState: 'uploaded',
        storageKey: `artifacts/${entryId}/${artifactId}`,
      },
    });

    const markers = await execute(studentToken, [
      {
        operationId: 'v1-teaching-markers',
        entityId: entryId,
        kind: 'replaceCaptureMarkers',
        baseVersion: 2,
        payload: {
          markers: [
            {
              id: 'v1-capture-marker',
              artifactId,
              timeSeconds: 18,
              kind: 'phase_modeling',
              note: 'Teacher models the pulse.',
            },
          ],
        },
      },
    ]);
    expect(markers.body.results[0]).toMatchObject({ status: 'applied', currentVersion: 3 });
    await expect(prisma.captureMarker.count({ where: { entryId } })).resolves.toBe(1);

    const submitted = await execute(studentToken, [
      {
        operationId: 'v1-teaching-submit',
        entityId: entryId,
        kind: 'submitEntry',
        baseVersion: 3,
        payload: {},
      },
    ]);
    expect(submitted.body.results[0]).toMatchObject({
      status: 'applied',
      currentVersion: 4,
      resource: { status: 'submitted' },
    });

    const reviewed = await execute(teacherToken, [
      {
        operationId: 'v1-teaching-feedback',
        entityId: 'v1-feedback',
        kind: 'createFeedback',
        baseVersion: 4,
        payload: {
          targetType: 'artifact',
          targetId: artifactId,
          status: 'next_goal',
          commentsText: 'Keep the modeled phrase short before adding variation.',
          markers: [
            {
              id: 'v1-feedback-marker',
              timeSeconds: 18,
              text: 'The pulse is clear here.',
            },
          ],
        },
      },
    ]);
    expect(reviewed.body.results[0]).toMatchObject({
      status: 'applied',
      currentVersion: 5,
      resource: { status: 'reviewed' },
    });
    await expect(prisma.feedback.count({ where: { entryId } })).resolves.toBe(1);
  });

  it('deletes an entry through the command pipeline and records its tombstone', async () => {
    const entryId = 'v1-entry-delete';
    await prisma.user.create({
      data: { id: 'student-delete', displayName: 'Delete Student', globalRole: 'student' },
    });
    await prisma.membership.create({
      data: { userId: 'student-delete', courseId: 'COURSE_TEST', roleInCourse: 'student' },
    });
    const deleteToken = await getAccessToken('student', { userId: 'student-delete' });
    const created = create('v1-delete-create');
    created.entityId = entryId;
    await execute(deleteToken, [created]);

    const deleted = await execute(deleteToken, [
      {
        operationId: 'v1-delete-apply',
        entityId: entryId,
        kind: 'deleteEntry',
        baseVersion: 1,
        payload: {},
      },
    ]);

    expect(deleted.body.results[0]).toMatchObject({ status: 'applied' });
    await expect(prisma.practiceEntry.findUnique({ where: { id: entryId } })).resolves.toBeNull();
    await expect(
      prisma.deletedEntryTombstone.findUnique({ where: { id: entryId } })
    ).resolves.toMatchObject({ id: entryId });
  });
});
