// Verifies entry create and update bodies fail validation before mutations run.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, installBasicSuite, login, prisma } from '../support/testUtils.js';

function postEntry(token: string, body: Record<string, unknown>) {
  return request(app.server)
    .post('/courses/COURSE_TEST/entries')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function patchEntry(token: string, entryId: string, body: Record<string, unknown>) {
  return request(app.server)
    .patch(`/entries/${entryId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function expectNullBodyRejected(method: 'post' | 'patch', path: string) {
  const token = await login('student');
  const pendingRequest = request(app.server)[method](path);
  const response = await pendingRequest
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send('null');

  expect(response.status).toBe(400);
  expect(response.body.error?.code).toBe('VALIDATION_ERROR');
}

installBasicSuite();

describe('POST /courses/:courseId/entries', () => {
  it('rejects a JSON null request body', async () => {
    await expectNullBodyRejected('post', '/courses/COURSE_TEST/entries');
  });

  it('rejects durationSeconds exceeding upper bound', async () => {
    const token = await login('student');
    const res = await postEntry(token, {
      id: 'entry-dur-too-high',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags: [],
      durationSeconds: 99999,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('accepts durationSeconds at upper bound (28800)', async () => {
    const token = await login('student');
    const res = await postEntry(token, {
      id: 'entry-dur-max',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags: [],
      durationSeconds: 28800,
    });
    expect(res.status).toBe(201);
    expect(res.body.durationSeconds).toBe(28800);
  });

  it('rejects too many tags', async () => {
    const token = await login('student');
    const tags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    const res = await postEntry(token, {
      id: 'entry-too-many-tags',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects tag exceeding max length', async () => {
    const token = await login('student');
    const res = await postEntry(token, {
      id: 'entry-long-tag',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags: ['a'.repeat(101)],
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects whitespace-only tags', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-blank-tag',
        practiceDate: new Date().toISOString(),
        goalText: 'Test',
        tags: ['   '],
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('stores trimmed tag values', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-trimmed-tag',
        practiceDate: new Date().toISOString(),
        goalText: 'Test',
        tags: ['  tone  '],
      });
    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(['tone']);
  });

  it('accepts tag at max length (100)', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-max-tag',
        practiceDate: new Date().toISOString(),
        goalText: 'Test',
        tags: ['a'.repeat(100)],
      });
    expect(res.status).toBe(201);
  });

  it('accepts teaching lesson entries with consent metadata', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-teaching-lesson',
        kind: 'teaching_lesson',
        practiceDate: new Date().toISOString(),
        goalText: 'Film rhythm teaching segment',
        tags: ['lehramt', 'rhythmus'],
        consentConfirmed: true,
        consentScope: 'private_course_review',
        captureProfile: 'teacher_learner',
      });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('teaching_lesson');
    expect(res.body.consentScope).toBe('private_course_review');
    expect(res.body.captureProfile).toBe('teacher_learner');
    expect(typeof res.body.consentConfirmedAt).toBe('string');
  });

  it('rejects captureProfile on practice entries', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-practice-with-camera-profile',
        practiceDate: new Date().toISOString(),
        goalText: 'Normal practice',
        tags: [],
        captureProfile: 'room_overview',
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid entry kinds', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-invalid-kind',
        kind: 'lesson',
        practiceDate: new Date().toISOString(),
        goalText: 'Invalid kind',
        tags: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects consent scope without confirmed teaching consent', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-scope-without-consent',
        kind: 'teaching_lesson',
        practiceDate: new Date().toISOString(),
        goalText: 'Film ensemble instruction',
        tags: [],
        consentScope: 'private_course_review',
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative durationSeconds', async () => {
    const token = await login('student');
    const res = await postEntry(token, {
      id: 'entry-neg-dur',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags: [],
      durationSeconds: -1,
    });
    expect(res.status).toBe(400);
  });

  it('rejects decimal durationSeconds', async () => {
    const token = await login('student');
    const res = await postEntry(token, {
      id: 'entry-decimal-dur',
      practiceDate: new Date().toISOString(),
      goalText: 'Test',
      tags: [],
      durationSeconds: 1.5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects impossible calendar dates', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-impossible-date',
        practiceDate: '2025-02-30',
        goalText: 'Test',
        tags: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /entries/:entryId', () => {
  let entryId: string;

  beforeEach(async () => {
    entryId = 'entry-patch-test';
    await prisma.practiceEntry.create({
      data: {
        id: entryId,
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Original',
        tags: ['original'],
        status: 'draft',
      },
    });
  });

  it('rejects a JSON null request body', async () => {
    await expectNullBodyRejected('patch', `/entries/${entryId}`);
  });

  it('rejects durationSeconds exceeding upper bound', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ durationSeconds: 30000 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('allows null to clear durationSeconds', async () => {
    const token = await login('student');
    // First set it
    await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ durationSeconds: 100 });
    // Then clear it
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ durationSeconds: null });
    expect(res.status).toBe(200);
    expect(res.body.durationSeconds).toBeNull();
  });

  it('allows null to clear notes', async () => {
    const token = await login('student');
    await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Some notes' });
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: null });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBeNull();
  });

  it('rejects tag exceeding max length in PATCH', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tags: ['a'.repeat(101)] });
    expect(res.status).toBe(400);
  });

  it('rejects whitespace-only tags in PATCH', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tags: ['\t  '] });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('stores trimmed tag values in PATCH', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tags: ['  rhythm  '] });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['rhythm']);
  });

  it('rejects too many tags in PATCH', async () => {
    const token = await login('student');
    const tags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tags });
    expect(res.status).toBe(400);
  });

  it('locks submitted entries using field presence (not truthiness)', async () => {
    await prisma.practiceEntry.update({
      where: { id: entryId },
      data: { status: 'submitted' },
    });
    const token = await login('student');

    // Even sending falsy values like empty string should trigger the lock
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ goalText: '' });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ENTRY_LOCKED');
  });

  it('rejects decimal durationSeconds in PATCH', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ durationSeconds: 12.5 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects clearing consent scope while teaching consent remains confirmed', async () => {
    await prisma.practiceEntry.update({
      where: { id: entryId },
      data: {
        kind: 'teaching_lesson',
        consentConfirmedAt: new Date(),
        consentScope: 'private_course_review',
      },
    });
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consentScope: null });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('preserves the original consent timestamp when confirmed consent is re-sent', async () => {
    const confirmedAt = new Date('2026-04-29T09:00:00.000Z');
    await prisma.practiceEntry.update({
      where: { id: entryId },
      data: {
        kind: 'teaching_lesson',
        consentConfirmedAt: confirmedAt,
        consentScope: 'private_course_review',
      },
    });
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        goalText: 'Updated without reconfirming consent',
        kind: 'teaching_lesson',
        consentConfirmed: true,
        consentScope: 'private_course_review',
      });
    expect(res.status).toBe(200);
    expect(res.body.consentConfirmedAt).toBe(confirmedAt.toISOString());
  });

  it('accepts captureProfile updates for draft teaching lesson entries', async () => {
    await prisma.practiceEntry.update({
      where: { id: entryId },
      data: { kind: 'teaching_lesson' },
    });
    const token = await login('student');
    const res = await patchEntry(token, entryId, { captureProfile: 'room_overview' });
    expect(res.status).toBe(200);
    expect(res.body.captureProfile).toBe('room_overview');
  });

  it('rejects captureProfile updates on practice entries', async () => {
    const token = await login('student');
    const res = await patchEntry(token, entryId, { captureProfile: 'room_overview' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
