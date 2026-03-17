import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { S3Client } from '@aws-sdk/client-s3';
import { ApiError } from '../errors.js';
import { ErrorCodes } from '../errorCodes.js';
import {
  requireField,
  requireString,
  requireStringArray,
  requireValidDate,
  requireNumber,
  requireCourseRole,
  requireEntryAccess,
  requireStudentOwner
} from '../validation.js';
import { cascadeDeleteEntry, cleanupS3Objects } from '../services/entryCascade.js';

export function registerEntryRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  s3: S3Client,
  requireAuth: (request: FastifyRequest) => Promise<void>
) {
  app.post('/courses/:courseId/entries', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'student') {
      throw new ApiError(403, ErrorCodes.STUDENT_ONLY, 'Only students can create entries');
    }
    const body = request.body as Record<string, unknown>;
    const entryId = requireString(requireField(body?.id, 'id'), 'id');
    const practiceDate = requireValidDate(body?.practiceDate, 'practiceDate');
    const goalText = requireString(requireField(body?.goalText, 'goalText'), 'goalText');
    const tags = body?.tags === undefined ? [] : requireStringArray(body.tags, 'tags');
    const durationSeconds =
      body?.durationSeconds === undefined
        ? null
        : requireNumber(body?.durationSeconds, 'durationSeconds', { min: 0 });
    const notes =
      body?.notes === undefined || body?.notes === null
        ? null
        : requireString(body.notes, 'notes');
    const entry = await prisma.practiceEntry.create({
      data: {
        id: entryId,
        courseId,
        studentId: user.id,
        practiceDate,
        goalText,
        durationSeconds,
        tags,
        notes,
        status: 'draft'
      }
    });
    return entry;
  });

  app.patch('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    await requireStudentOwner(prisma, user.id, entry, 'edit entries');

    const body = request.body as Record<string, unknown>;

    // Check submitted-entry lock using "field present in body" instead of truthiness
    // This prevents bypassing the lock with falsy values like "" or 0
    if (entry.status !== 'draft') {
      const hasRestrictedField =
        'goalText' in body ||
        'practiceDate' in body ||
        'tags' in body ||
        'durationSeconds' in body ||
        'notes' in body;
      if (hasRestrictedField) {
        throw new ApiError(409, ErrorCodes.ENTRY_LOCKED, 'Only draft entries can be edited');
      }
    }

    // Build update data with proper null handling
    const updateData: Record<string, unknown> = {};

    if ('goalText' in body) {
      updateData.goalText = requireString(body.goalText, 'goalText');
    }

    if ('practiceDate' in body) {
      updateData.practiceDate = requireValidDate(body.practiceDate, 'practiceDate');
    }

    if ('durationSeconds' in body) {
      // Allow explicit null to clear the field
      if (body.durationSeconds === null) {
        updateData.durationSeconds = null;
      } else {
        updateData.durationSeconds = requireNumber(body.durationSeconds, 'durationSeconds', { min: 0 });
      }
    }

    if ('tags' in body) {
      updateData.tags = requireStringArray(body.tags, 'tags');
    }

    if ('notes' in body) {
      // Allow explicit null to clear the field
      updateData.notes = body.notes === null ? null : requireString(body.notes, 'notes');
    }

    const updated = await prisma.practiceEntry.update({
      where: { id: entryId },
      data: updateData
    });
    return updated;
  });

  app.delete('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    await requireStudentOwner(prisma, user.id, entry, 'delete');

    const storageKeys = await cascadeDeleteEntry(prisma, entryId);
    await cleanupS3Objects(s3, storageKeys, request.log);

    return { success: true };
  });

  app.post('/entries/:entryId/submit', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    await requireStudentOwner(prisma, user.id, entry, 'submit');
    if (entry.status !== 'draft') {
      throw new ApiError(409, ErrorCodes.ENTRY_LOCKED, 'Only draft entries can be submitted');
    }
    const artifacts = await prisma.artifact.findMany({ where: { entryId } });
    if (artifacts.length === 0 || artifacts.some((a) => a.uploadState !== 'uploaded')) {
      throw new ApiError(409, ErrorCodes.ARTIFACTS_NOT_UPLOADED, 'Upload artifacts before submitting');
    }
    const updated = await prisma.practiceEntry.update({
      where: { id: entryId },
      data: { status: 'submitted' }
    });
    return updated;
  });

  app.get('/entries/:entryId/feedback', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    const feedback = await prisma.feedback.findMany({
      where: { targetType: 'entry', targetId: entry.id },
      include: { markers: true, teacher: true }
    });
    return feedback.map((item) => ({
      id: item.id,
      targetType: item.targetType,
      targetId: item.targetId,
      teacherId: item.teacherId,
      teacherName: item.teacher.displayName,
      createdAt: item.createdAt,
      status: item.status,
      commentsText: item.commentsText,
      markers: item.markers
    }));
  });
}
