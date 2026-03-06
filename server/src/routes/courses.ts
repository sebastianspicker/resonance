import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { S3Client } from '@aws-sdk/client-s3';
import { ApiError } from '../errors.js';
import { ErrorCodes } from '../errorCodes.js';
import { requireCourseRole } from '../validation.js';

export function registerCourseRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  _s3: S3Client,
  requireAuth: (request: unknown) => Promise<void>
) {
  app.get('/courses', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { course: true }
    });
    return memberships.map((m) => ({
      id: m.course.id,
      title: m.course.title,
      roleInCourse: m.roleInCourse
    }));
  });

  app.get('/courses/:courseId', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    await requireCourseRole(prisma, user.id, courseId);
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new ApiError(404, ErrorCodes.COURSE_NOT_FOUND, 'Course not found');
    }
    return course;
  });

  app.get('/courses/:courseId/entries', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    const role = await requireCourseRole(prisma, user.id, courseId);
    const where =
      role === 'teacher'
        ? { courseId, status: 'submitted' as const, deletedAt: null }
        : { courseId, studentId: user.id, deletedAt: null };
    const entries = await prisma.practiceEntry.findMany({
      where,
      include: { artifacts: true }
    });
    return entries;
  });

  app.get('/courses/:courseId/review-queue', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'teacher') {
      throw new ApiError(403, ErrorCodes.TEACHER_ONLY, 'Only teachers can access the review queue');
    }
    const entries = await prisma.practiceEntry.findMany({
      where: { courseId, status: 'submitted', deletedAt: null },
      include: { artifacts: true, student: true },
      orderBy: [{ practiceDate: 'desc' }, { createdAt: 'desc' }]
    });
    return entries.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      studentId: entry.studentId,
      studentName: entry.student.displayName,
      practiceDate: entry.practiceDate,
      goalText: entry.goalText,
      notes: entry.notes,
      artifacts: entry.artifacts
    }));
  });
}
