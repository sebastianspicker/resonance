import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  app,
  createTestEntry,
  getReviewQueue,
  installBasicSuite,
  login,
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

async function createReviewQueueEntry(id: string, practiceDate: Date, createdAt?: Date) {
  return createTestEntry({
    id,
    practiceDate,
    createdAt,
    goalText: 'Review queue entry',
    tags: ['tag'],
    status: 'submitted',
  });
}

describe('acl course and entry visibility', () => {
  installBasicSuite();

  it('prevents student from reading other student entries', async () => {
    const otherStudent = await prisma.user.create({
      data: { id: 'student-2', displayName: 'Other Student', globalRole: 'student' },
    });
    await prisma.membership.create({
      data: { userId: otherStudent.id, courseId: 'COURSE_TEST', roleInCourse: 'student' },
    });
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-foreign',
        courseId: 'COURSE_TEST',
        studentId: otherStudent.id,
        practiceDate: new Date(),
        goalText: 'Other student entry',
        tags: ['tag'],
        status: 'draft',
      },
    });

    const token = await login('student');
    const res = await request(app.server)
      .get('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.find((e: any) => e.id === 'entry-foreign')).toBeUndefined();
  });

  it('allows teacher to view review queue', async () => {
    await createSubmittedEntry('entry-submitted');
    const token = await login('teacher');
    const res = await getReviewQueue(token);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.nextCursor).toBeNull();
  });

  it('never exposes draft entries or their artifacts to teachers', async () => {
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-teacher-hidden-draft',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Private draft',
        tags: [],
        status: 'draft',
      },
    });
    await prisma.artifact.create({
      data: {
        id: 'artifact-teacher-hidden-draft',
        entryId: 'entry-teacher-hidden-draft',
        type: 'audio',
        durationSeconds: 1,
        uploadState: 'uploaded',
        storageKey: 'private/draft',
      },
    });
    const token = await login('teacher');
    const protectedGetPaths = [
      '/courses/COURSE_TEST/entries?status=draft',
      '/api/v1/courses/COURSE_TEST/entries?status=draft',
      '/entries/entry-teacher-hidden-draft',
      '/api/v1/entries/entry-teacher-hidden-draft',
      '/artifacts/artifact-teacher-hidden-draft/download',
    ];

    for (const path of protectedGetPaths) {
      const response = await request(app.server).get(path).set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ENTRY_ACCESS_DENIED');
    }
    const downloadResponse = await request(app.server)
      .post('/api/v1/artifacts/artifact-teacher-hidden-draft/download-session')
      .set('Authorization', `Bearer ${token}`);
    expect(downloadResponse.status).toBe(403);
    expect(downloadResponse.body.error.code).toBe('ENTRY_ACCESS_DENIED');
  });

  it('returns review queue sorted by practiceDate desc then createdAt desc', async () => {
    await createReviewQueueEntry(
      'entry-old-practice',
      new Date('2025-01-01T10:00:00.000Z'),
      new Date('2025-01-01T09:00:00.000Z')
    );
    await createReviewQueueEntry(
      'entry-new-practice',
      new Date('2025-01-02T10:00:00.000Z'),
      new Date('2025-01-01T08:00:00.000Z')
    );
    await createReviewQueueEntry(
      'entry-same-practice-newer-created',
      new Date('2025-01-02T10:00:00.000Z'),
      new Date('2025-01-02T11:00:00.000Z')
    );

    const token = await login('teacher');
    const res = await getReviewQueue(token);

    expect(res.status).toBe(200);
    expect(res.body.items.map((entry: any) => entry.id)).toEqual([
      'entry-same-practice-newer-created',
      'entry-new-practice',
      'entry-old-practice',
    ]);
  });

  it('blocks access to deleted entries', async () => {
    const entry = await prisma.practiceEntry.create({
      data: {
        id: 'entry-deleted',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Deleted entry',
        tags: ['tag'],
        status: 'draft',
        deletedAt: new Date(),
      },
    });
    const token = await login('student');
    const res = await request(app.server)
      .patch(`/entries/${entry.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ goalText: 'Should fail' });

    expect(res.status).toBe(410);
  });

  it('rejects invalid practice dates', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'entry-bad-date', practiceDate: 'not-a-date', goalText: 'Bad date', tags: [] });

    expect(res.status).toBe(400);
  });

  it('rejects non-string tags', async () => {
    const token = await login('student');
    const res = await request(app.server)
      .post('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'entry-bad-tags',
        practiceDate: new Date().toISOString(),
        goalText: 'Bad tags',
        tags: ['ok', 123],
      });

    expect(res.status).toBe(400);
  });
});
