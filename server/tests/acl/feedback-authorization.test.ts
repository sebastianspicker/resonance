import { describe, expect, it } from 'vitest';
import {
  createTestArtifact,
  createTestEntry,
  installBasicSuite,
  login,
  postFeedback,
  prisma,
} from '../support/testUtils.js';

async function createSubmittedEntry(id: string) {
  return createTestEntry({
    id,
    practiceDate: new Date(),
    goalText: 'Retry target',
    tags: ['tag'],
    status: 'submitted',
  });
}

async function submitFeedback(token: string, body: Record<string, unknown>) {
  return postFeedback(token, body);
}

function idempotentFeedbackBody(id: string, targetId: string) {
  return {
    id,
    targetType: 'entry',
    targetId,
    status: 'ok',
    commentsText: 'Stable feedback',
    markers: [{ timeSeconds: 3, text: 'steady' }],
  };
}

async function expectEntryReviewed(entryId: string) {
  const updatedEntry = await prisma.practiceEntry.findUnique({ where: { id: entryId } });
  expect(updatedEntry?.status).toBe('reviewed');
}

describe('acl feedback authorization', () => {
  installBasicSuite();

  it('rejects invalid feedback status', async () => {
    const entry = await createTestEntry({
      id: 'entry-bad-feedback',
      practiceDate: new Date(),
      goalText: 'Feedback target',
      tags: ['tag'],
      status: 'submitted',
    });
    const token = await login('teacher');
    const res = await postFeedback(token, {
      targetType: 'entry',
      targetId: entry.id,
      status: 'invalid_status',
      commentsText: 'test',
      markers: [],
    });
    expect(res.status).toBe(400);
  });

  it('rejects feedback with non-existent entry targetId (bug #44)', async () => {
    const token = await login('teacher');
    const res = await postFeedback(token, {
      targetType: 'entry',
      targetId: 'non-existent-entry-id',
      status: 'ok',
      commentsText: 'This should fail',
      markers: [],
    });
    expect(res.status).toBe(404);
  });

  it('rejects feedback with non-existent artifact targetId (bug #44)', async () => {
    const token = await login('teacher');
    const res = await postFeedback(token, {
      targetType: 'artifact',
      targetId: 'non-existent-artifact-id',
      status: 'ok',
      commentsText: 'This should fail',
      markers: [],
    });
    expect(res.status).toBe(404);
  });

  it('marks entry as reviewed when teacher posts feedback directly on entry', async () => {
    const entry = await createTestEntry({
      id: 'entry-review-status',
      practiceDate: new Date(),
      goalText: 'Review target',
      tags: ['tag'],
      status: 'submitted',
    });
    const token = await login('teacher');
    const res = await postFeedback(token, {
      targetType: 'entry',
      targetId: entry.id,
      status: 'ok',
      commentsText: 'Looks good',
      markers: [],
    });
    expect(res.status).toBe(201);
    await expectEntryReviewed(entry.id);
  });

  it('treats repeated client feedback ids as idempotent retries', async () => {
    const entry = await createSubmittedEntry('entry-idempotent-feedback');
    const token = await login('teacher');
    const body = idempotentFeedbackBody('feedback_retry_1', entry.id);
    const first = await submitFeedback(token, body);
    const second = await submitFeedback(token, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe('feedback_retry_1');

    const feedbackRows = await prisma.feedback.findMany({ where: { id: 'feedback_retry_1' } });
    const markerRows = await prisma.marker.findMany({ where: { feedbackId: 'feedback_retry_1' } });
    expect(feedbackRows).toHaveLength(1);
    expect(markerRows).toHaveLength(1);
  });

  it.each([
    ['status', { status: 'needs_revision' }],
    ['comments', { commentsText: 'Changed feedback' }],
    ['markers', { markers: [{ timeSeconds: 4, text: 'steady' }] }],
  ])('rejects reused client feedback ids when %s change', async (_field, change) => {
    const entry = await createSubmittedEntry(`entry-feedback-${_field}-conflict`);
    const token = await login('teacher');
    const body = idempotentFeedbackBody(`feedback_retry_${_field}_conflict`, entry.id);
    const first = await submitFeedback(token, body);
    const second = await submitFeedback(token, { ...body, ...change });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe('ID_CONFLICT');
  });

  it('marks parent entry as reviewed when teacher posts feedback on artifact', async () => {
    const entry = await createTestEntry({
      id: 'entry-artifact-review-status',
      practiceDate: new Date(),
      goalText: 'Artifact review target',
      tags: ['tag'],
      status: 'submitted',
    });
    const artifact = await createTestArtifact({
      id: 'artifact-review-status',
      entryId: entry.id,
      type: 'audio',
      durationSeconds: 12,
      uploadState: 'uploaded',
    });
    const token = await login('teacher');
    const res = await postFeedback(token, {
      targetType: 'artifact',
      targetId: artifact.id,
      status: 'ok',
      commentsText: 'Great take',
      markers: [],
    });
    expect(res.status).toBe(201);
    await expectEntryReviewed(entry.id);
  });
});
