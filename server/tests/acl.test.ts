import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { app, setupApp, teardownApp, resetDb, seedBasic, prisma, s3Mock } from './testUtils.js';

async function login(role: 'student' | 'teacher') {
  const userId = role === 'student' ? 'student-1' : 'teacher-1';
  const issue = await request(app.server).post('/dev/issue').send({ userId, role });
  const session = await request(app.server).post('/auth/session').send({ code: issue.body.code, redirectUri: 'resonance://auth-callback' });
  return session.body.accessToken as string;
}

describe('acl', () => {
  beforeAll(async () => {
    await setupApp();
  });

  afterAll(async () => {
    await teardownApp();
  });

  beforeEach(async () => {
    await resetDb();
    await seedBasic();
  });

  it('prevents student from reading other student entries', async () => {
    const otherStudent = await prisma.user.create({
      data: { id: 'student-2', displayName: 'Other Student', globalRole: 'student' }
    });
    await prisma.membership.create({
      data: { userId: otherStudent.id, courseId: 'COURSE_TEST', roleInCourse: 'student' }
    });

    await prisma.practiceEntry.create({
      data: {
        id: 'entry-foreign',
        courseId: 'COURSE_TEST',
        studentId: otherStudent.id,
        practiceDate: new Date(),
        goalText: 'Other student entry',
        tags: ['tag'],
        status: 'draft'
      }
    });

    const token = await login('student');
    const res = await request(app.server)
      .get('/courses/COURSE_TEST/entries')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.find((e: any) => e.id === 'entry-foreign')).toBeUndefined();
  });

  it('allows teacher to view review queue', async () => {
    await prisma.practiceEntry.create({
      data: {
        id: 'entry-submitted',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Submitted entry',
        tags: ['tag'],
        status: 'submitted'
      }
    });

    const token = await login('teacher');
    const res = await request(app.server)
      .get('/courses/COURSE_TEST/review-queue')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
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
        deletedAt: new Date()
      }
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
      .send({
        id: 'entry-bad-date',
        practiceDate: 'not-a-date',
        goalText: 'Bad date',
        tags: []
      });

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
        tags: ['ok', 123]
      });

    expect(res.status).toBe(400);
  });

  it('hard deletes entries, artifacts, and feedback', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    const entry = await prisma.practiceEntry.create({
      data: {
        id: 'entry-hard-delete',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Delete me',
        tags: ['tag'],
        status: 'draft'
      }
    });

    const artifact = await prisma.artifact.create({
      data: {
        id: 'artifact-hard-delete',
        entryId: entry.id,
        type: 'audio',
        durationSeconds: 10,
        uploadState: 'uploaded',
        storageKey: 'artifacts/entry-hard-delete/artifact-hard-delete'
      }
    });

    await prisma.feedback.create({
      data: {
        id: 'fb_entry_1',
        targetType: 'entry',
        targetId: entry.id,
        teacherId: 'teacher-1',
        status: 'ok',
        commentsText: 'Good job',
        markers: {
          create: [{ id: 'mk_entry_1', timeSeconds: 1, text: 'nice' }]
        }
      }
    });

    await prisma.feedback.create({
      data: {
        id: 'fb_artifact_1',
        targetType: 'artifact',
        targetId: artifact.id,
        teacherId: 'teacher-1',
        status: 'ok',
        commentsText: 'Nice sound',
        markers: {
          create: [{ id: 'mk_artifact_1', timeSeconds: 2, text: 'tone' }]
        }
      }
    });

    const token = await login('student');
    const res = await request(app.server)
      .delete(`/entries/${entry.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(s3Mock.commandCalls(DeleteObjectCommand).length).toBe(1);

    const entryAfter = await prisma.practiceEntry.findUnique({ where: { id: entry.id } });
    const artifactAfter = await prisma.artifact.findUnique({ where: { id: artifact.id } });
    const feedbackAfter = await prisma.feedback.findMany({ where: { targetId: entry.id } });
    const artifactFeedbackAfter = await prisma.feedback.findMany({ where: { targetId: artifact.id } });
    const markerAfter = await prisma.marker.findUnique({ where: { id: 'mk_entry_1' } });

    expect(entryAfter).toBeNull();
    expect(artifactAfter).toBeNull();
    expect(feedbackAfter.length).toBe(0);
    expect(artifactFeedbackAfter.length).toBe(0);
    expect(markerAfter).toBeNull();
  });

  it('rejects invalid artifact type', async () => {
    const entry = await prisma.practiceEntry.create({
      data: {
        id: 'entry-bad-artifact',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Invalid artifact',
        tags: ['tag'],
        status: 'draft'
      }
    });

    const token = await login('student');
    const res = await request(app.server)
      .post(`/entries/${entry.id}/artifacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'artifact-bad', type: 'image', durationSeconds: 5 });

    expect(res.status).toBe(400);
  });

  it('rejects invalid feedback status', async () => {
    const entry = await prisma.practiceEntry.create({
      data: {
        id: 'entry-bad-feedback',
        courseId: 'COURSE_TEST',
        studentId: 'student-1',
        practiceDate: new Date(),
        goalText: 'Feedback target',
        tags: ['tag'],
        status: 'submitted'
      }
    });

    const token = await login('teacher');
    const res = await request(app.server)
      .post('/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'entry',
        targetId: entry.id,
        status: 'invalid_status',
        commentsText: 'test',
        markers: []
      });

    expect(res.status).toBe(400);
  });
});
