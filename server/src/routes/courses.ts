import type { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorCodes } from '../errorCodes.js';
import { ApiError } from '../errors.js';
import { requireCourseRole } from '../validation.js';

export function registerCourseRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  _s3: S3Client,
  requireAuth: (request: FastifyRequest) => Promise<void>
) {
  app.get('/courses', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { course: true },
    });
    return memberships.map((m) => ({
      id: m.course.id,
      title: m.course.title,
      roleInCourse: m.roleInCourse,
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

    // Optional status filter: ?status=draft | submitted | reviewed
    const validStatuses = ['draft', 'submitted', 'reviewed'] as const;
    type ValidStatus = (typeof validStatuses)[number];
    const queryStatus = (request.query as { status?: string }).status;
    if (queryStatus !== undefined && !validStatuses.includes(queryStatus as ValidStatus)) {
      throw new ApiError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        `Invalid status filter: must be one of ${validStatuses.join(', ')}`
      );
    }
    const statusFilter = queryStatus as ValidStatus | undefined;

    const where: Record<string, unknown> = { courseId, deletedAt: null };
    if (role === 'teacher') {
      // Default to 'submitted' for teachers when no filter is provided
      where.status = statusFilter ?? 'submitted';
    } else {
      where.studentId = user.id;
      if (statusFilter) {
        where.status = statusFilter;
      }
    }

    const entries = await prisma.practiceEntry.findMany({
      where,
      include: { artifacts: true },
    });
    return entries;
  });

  // TODO: Pagination gap — this endpoint returns all submitted entries at once.
  // When the review queue grows large, implement cursor-based pagination using
  // (practiceDate, createdAt, id) as the cursor key, matching the current orderBy.
  // The response shape would add { cursor?: string; hasMore: boolean } alongside the entries array.
  app.get('/courses/:courseId/review-queue', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'teacher') {
      throw new ApiError(403, ErrorCodes.TEACHER_ONLY, 'Only teachers can access the review queue');
    }
    const entries = await prisma.practiceEntry.findMany({
      where: { courseId, status: 'submitted', deletedAt: null },
      include: {
        artifacts: true,
        student: { select: { displayName: true } },
      },
      orderBy: [{ practiceDate: 'desc' }, { createdAt: 'desc' }],
    });
    return entries.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      studentId: entry.studentId,
      studentName: entry.student.displayName,
      practiceDate: entry.practiceDate,
      goalText: entry.goalText,
      notes: entry.notes,
      artifacts: entry.artifacts,
    }));
  });
}
