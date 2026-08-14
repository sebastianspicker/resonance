import { describe, expect, it } from 'vitest';
import { prisma } from '../support/testUtils.js';
import {
  createEntryCommand,
  enrollCourseMember,
  executeSyncCommands,
  installV1SyncSuite,
} from './support.js';

function expectReviewedResult(response: { body: { results: unknown[] } }) {
  expect(response.body.results[0]).toMatchObject({
    status: 'applied',
    currentVersion: 5,
    resource: { status: 'reviewed' },
  });
}

describe('v1 sync command receipts and versions', () => {
  const suite = installV1SyncSuite();
  const create = createEntryCommand;
  const execute = executeSyncCommands;

  it('applies the teaching-lesson command lifecycle through reviewed feedback', async () => {
    const entryId = 'v1-teaching-entry';
    const artifactId = 'v1-teaching-video';
    const lifecycleStudentToken = await enrollCourseMember(
      'student',
      'student-teaching-lifecycle',
      'Teaching Lifecycle Student'
    );
    const captureMarkerPayload = (
      id: string,
      markerArtifactId: string,
      timeSeconds: number,
      kind: string,
      note: string | null
    ) => ({ markers: [{ id, artifactId: markerArtifactId, timeSeconds, kind, note }] });

    const created = await execute(lifecycleStudentToken, [
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

    const updated = await execute(lifecycleStudentToken, [
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

    const missingArtifactMarker = await execute(lifecycleStudentToken, [
      {
        operationId: 'v1-teaching-marker-missing-artifact',
        entityId: entryId,
        kind: 'replaceCaptureMarkers',
        baseVersion: 2,
        payload: captureMarkerPayload(
          'v1-missing-artifact-marker',
          'v1-missing-video',
          3,
          'phase_setup',
          null
        ),
      },
    ]);
    expect(missingArtifactMarker.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'ARTIFACT_NOT_FOUND',
    });

    const markers = await execute(lifecycleStudentToken, [
      {
        operationId: 'v1-teaching-markers',
        entityId: entryId,
        kind: 'replaceCaptureMarkers',
        baseVersion: 2,
        payload: captureMarkerPayload(
          'v1-capture-marker',
          artifactId,
          18,
          'phase_modeling',
          'Teacher models the pulse.'
        ),
      },
    ]);
    expect(markers.body.results[0]).toMatchObject({ status: 'applied', currentVersion: 3 });
    await expect(prisma.captureMarker.count({ where: { entryId } })).resolves.toBe(1);

    const submitted = await execute(lifecycleStudentToken, [
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

    const feedbackPayload = {
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
    };
    const reviewed = await execute(suite.teacherToken, [
      {
        operationId: 'v1-teaching-feedback',
        entityId: 'v1-feedback',
        kind: 'createFeedback',
        baseVersion: 4,
        payload: feedbackPayload,
      },
    ]);
    expectReviewedResult(reviewed);
    await expect(prisma.feedback.count({ where: { entryId } })).resolves.toBe(1);

    const idempotentFeedback = await execute(suite.teacherToken, [
      {
        operationId: 'v1-teaching-feedback-idempotent',
        entityId: 'v1-feedback',
        kind: 'createFeedback',
        baseVersion: 5,
        payload: feedbackPayload,
      },
    ]);
    expectReviewedResult(idempotentFeedback);
    await expect(prisma.feedback.count({ where: { entryId } })).resolves.toBe(1);
  });

  it('enforces feedback state and stable feedback identities', async () => {
    const entryId = 'v1-feedback-entry';
    const isolatedStudentToken = await enrollCourseMember(
      'student',
      'student-feedback-errors',
      'Feedback Student'
    );
    const isolatedTeacherToken = await enrollCourseMember(
      'teacher',
      'teacher-feedback-errors',
      'Feedback Teacher'
    );
    const created = create('v1-feedback-entry-create');
    created.entityId = entryId;
    await execute(isolatedStudentToken, [created]);

    const feedbackPayload = {
      targetType: 'entry',
      targetId: entryId,
      status: 'ok',
      commentsText: 'The pulse is stable.',
      markers: [],
    };
    const draftFeedback = await execute(isolatedTeacherToken, [
      {
        operationId: 'v1-feedback-draft',
        entityId: 'v1-feedback-stable-id',
        kind: 'createFeedback',
        baseVersion: 1,
        payload: feedbackPayload,
      },
    ]);
    expect(draftFeedback.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'ENTRY_NOT_SUBMITTED',
    });

    await prisma.practiceEntry.update({
      where: { id: entryId },
      data: { status: 'submitted' },
    });
    const studentFeedback = await execute(isolatedStudentToken, [
      {
        operationId: 'v1-feedback-student-rejected',
        entityId: 'v1-feedback-student-id',
        kind: 'createFeedback',
        baseVersion: 1,
        payload: feedbackPayload,
      },
    ]);
    expect(studentFeedback.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'TEACHER_ONLY',
    });
    const appliedFeedback = await execute(isolatedTeacherToken, [
      {
        operationId: 'v1-feedback-applied',
        entityId: 'v1-feedback-stable-id',
        kind: 'createFeedback',
        baseVersion: 1,
        payload: feedbackPayload,
      },
    ]);
    expect(appliedFeedback.body.results[0]).toMatchObject({
      status: 'applied',
      currentVersion: 2,
    });

    const mismatchedFeedback = await execute(isolatedTeacherToken, [
      {
        operationId: 'v1-feedback-mismatched',
        entityId: 'v1-feedback-stable-id',
        kind: 'createFeedback',
        baseVersion: 2,
        payload: { ...feedbackPayload, commentsText: 'Different feedback content.' },
      },
    ]);
    expect(mismatchedFeedback.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'ID_CONFLICT',
    });
  });
});
