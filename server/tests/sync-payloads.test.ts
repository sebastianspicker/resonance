import type { PracticeEntry } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { parseEntryUpdatePayload } from '../src/services/sync/payloads.js';

function entry(overrides: Partial<PracticeEntry> = {}): PracticeEntry {
  return {
    id: 'entry-1',
    courseId: 'course-1',
    studentId: 'student-1',
    createdAt: new Date('2026-08-01T08:00:00.000Z'),
    kind: 'practice',
    practiceDate: new Date('2026-08-01T08:00:00.000Z'),
    goalText: 'Improve bow control',
    durationSeconds: 900,
    tags: ['strings'],
    notes: 'Keep the wrist relaxed',
    status: 'draft',
    consentConfirmedAt: null,
    consentScope: null,
    captureProfile: null,
    updatedAt: new Date('2026-08-01T08:00:00.000Z'),
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

function expectValidationError(operation: () => unknown, message: string) {
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message,
    });
    return;
  }
  throw new Error('Expected validation to throw');
}

describe('sync entry update payloads', () => {
  it('serializes scalar patches with Prisma relation updates and nullable values', () => {
    expect(
      parseEntryUpdatePayload(
        {
          practiceDate: '2026-08-02',
          goalText: '  Refine articulation  ',
          durationSeconds: null,
          tags: ['rhythm', 'ensemble'],
          notes: null,
        },
        entry()
      )
    ).toEqual({
      practiceDate: new Date('2026-08-02T00:00:00.000Z'),
      goalText: 'Refine articulation',
      durationSeconds: null,
      tags: { set: ['rhythm', 'ensemble'] },
      notes: null,
    });
  });

  it('inherits teaching metadata when a scalar-only patch does not replace it', () => {
    const confirmedAt = new Date('2026-08-01T09:30:00.000Z');

    expect(
      parseEntryUpdatePayload(
        { goalText: 'Add a listening check' },
        entry({
          kind: 'teaching_lesson',
          consentConfirmedAt: confirmedAt,
          consentScope: 'private_course_review',
          captureProfile: 'teacher_learner',
        })
      )
    ).toEqual({ goalText: 'Add a listening check' });
  });

  it.each([
    {
      name: 'kind',
      payload: { kind: 'teaching_lesson' },
      existing: entry(),
      expected: { kind: 'teaching_lesson' },
    },
    {
      name: 'consent confirmation',
      payload: { consentConfirmedAt: '2026-08-02T09:30:00.000Z' },
      existing: entry({
        kind: 'teaching_lesson',
        consentConfirmedAt: new Date('2026-08-01T09:30:00.000Z'),
        consentScope: 'private_course_review',
      }),
      expected: { consentConfirmedAt: new Date('2026-08-02T09:30:00.000Z') },
    },
    {
      name: 'consent scope',
      payload: { consentScope: 'private_course_review' },
      existing: entry({
        kind: 'teaching_lesson',
        consentConfirmedAt: new Date('2026-08-01T09:30:00.000Z'),
        consentScope: 'private_course_review',
      }),
      expected: { consentScope: 'private_course_review' },
    },
    {
      name: 'capture profile',
      payload: { captureProfile: 'teacher_learner' },
      existing: entry({ kind: 'teaching_lesson' }),
      expected: { captureProfile: 'teacher_learner' },
    },
    {
      name: 'paired consent and capture metadata cleared to null',
      payload: { consentConfirmedAt: null, consentScope: null, captureProfile: null },
      existing: entry({
        kind: 'teaching_lesson',
        consentConfirmedAt: new Date('2026-08-01T09:30:00.000Z'),
        consentScope: 'private_course_review',
        captureProfile: 'room_overview',
      }),
      expected: { consentConfirmedAt: null, consentScope: null, captureProfile: null },
    },
  ])('serializes only the patched $name metadata field', ({ payload, existing, expected }) => {
    expect(parseEntryUpdatePayload(payload, existing)).toEqual(expected);
  });

  it('rejects practice capture metadata', () => {
    expectValidationError(
      () => parseEntryUpdatePayload({ captureProfile: 'room_overview' }, entry()),
      'Consent and capture metadata are only valid for teaching lesson entries'
    );
  });

  it('requires consent confirmation and scope to remain paired', () => {
    expectValidationError(
      () =>
        parseEntryUpdatePayload(
          { consentScope: null },
          entry({
            kind: 'teaching_lesson',
            consentConfirmedAt: new Date('2026-08-01T09:30:00.000Z'),
            consentScope: 'private_course_review',
          })
        ),
      'consentConfirmedAt and consentScope must be provided together'
    );
  });

  it('checks field validation before metadata validation and only then rejects empty updates', () => {
    expectValidationError(
      () => parseEntryUpdatePayload({ goalText: ' ', captureProfile: 'room_overview' }, entry()),
      'String too short: payload.goalText (min 1)'
    );

    expectValidationError(() => parseEntryUpdatePayload({}, entry()), 'Update payload is empty');

    expectValidationError(
      () =>
        parseEntryUpdatePayload(
          {},
          entry({
            kind: 'teaching_lesson',
            consentConfirmedAt: new Date('2026-08-01T09:30:00.000Z'),
            consentScope: null,
          })
        ),
      'consentConfirmedAt and consentScope must be provided together'
    );
  });
});
