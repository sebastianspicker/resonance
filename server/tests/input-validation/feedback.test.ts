// Verifies feedback payload validation before feedback records are created.
import { beforeEach, describe, expect, it } from 'vitest';
import { installBasicSuite, login, postFeedback, prisma } from '../support/testUtils.js';

installBasicSuite();

describe('POST /feedback', () => {
  let entryId: string;

  beforeEach(async () => {
    entryId = 'entry-feedback-val';
    await prisma.practiceEntry.create({
      data: {
        id: entryId,
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Feedback target',
        tags: ['tag'],
        status: 'submitted',
      },
    });
  });

  it.each([
    [
      'rejects commentsText exceeding max length',
      { commentsText: 'x'.repeat(10001), markers: [] },
      400,
    ],
    ['accepts commentsText at max length', { commentsText: 'x'.repeat(10000), markers: [] }, 201],
    ['rejects whitespace-only commentsText', { commentsText: '   \n\t', markers: [] }, 400],
    [
      'stores trimmed commentsText',
      { commentsText: '  Focus the attack.  ', markers: [] },
      201,
      'Focus the attack.',
    ],
    [
      'rejects marker with timeSeconds exceeding upper bound',
      { commentsText: 'Review', markers: [{ timeSeconds: 99999, text: 'Too far' }] },
      400,
    ],
    [
      'rejects marker missing text',
      { commentsText: 'Review', markers: [{ timeSeconds: 10 }] },
      400,
    ],
    [
      'rejects marker missing timeSeconds',
      { commentsText: 'Review', markers: [{ text: 'No time' }] },
      400,
    ],
    [
      'rejects marker with text exceeding max length',
      { commentsText: 'Review', markers: [{ timeSeconds: 5, text: 'z'.repeat(1001) }] },
      400,
    ],
    [
      'rejects marker with decimal timeSeconds',
      { commentsText: 'Review', markers: [{ timeSeconds: 12.5, text: 'Half second' }] },
      400,
    ],
  ])('%s', async (_name, body, expectedStatus, expectedCommentsText?) => {
    const res = await postFeedback(await login('teacher'), {
      targetType: 'entry',
      targetId: entryId,
      status: 'ok',
      ...body,
    });
    expect(res.status).toBe(expectedStatus);
    if (expectedStatus === 400) expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    if (expectedCommentsText) expect(res.body.commentsText).toBe(expectedCommentsText);
  });
});
