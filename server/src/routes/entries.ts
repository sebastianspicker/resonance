import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { S3Client } from '@aws-sdk/client-s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import {
  requireField,
  requireString,
  requireStringArray,
  requireValidDate,
  requireNumber,
  requireCourseRole,
  requireEntryAccess
} from '../validation.js';

export function registerEntryRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  s3: S3Client,
  requireAuth: (request: unknown) => Promise<void>
) {
  app.post('/courses/:courseId/entries', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const courseId = (request.params as { courseId: string }).courseId;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'student') {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only students can create entries');
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
    
    // Use course role for authorization
    const roleInCourse = await requireCourseRole(prisma, user.id, entry.courseId);
    if (roleInCourse !== 'student') {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only students can edit entries');
    }
    // Only the owner can edit
    if (entry.studentId !== user.id) {
      throw new ApiError(403, 'ENTRY_ACCESS_DENIED', 'Entry does not belong to student');
    }
    
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
        throw new ApiError(409, 'ENTRY_LOCKED', 'Only draft entries can be edited');
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
    
    // Get course role for authorization
    const roleInCourse = await requireCourseRole(prisma, user.id, entry.courseId);
    if (roleInCourse !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can delete');
    }

    // 1. First, perform DB cleanup in a transaction
    // Collect storage keys for later S3 cleanup
    const artifacts = await prisma.artifact.findMany({ 
      where: { entryId },
      select: { id: true, storageKey: true }
    });
    const storageKeys = artifacts
      .map(a => a.storageKey)
      .filter((key): key is string => key !== null);

    await prisma.$transaction(async (tx) => {
      const artifactIds = artifacts.map((a) => a.id);
      if (artifactIds.length > 0) {
        const artifactFeedback = await tx.feedback.findMany({
          where: { targetType: 'artifact', targetId: { in: artifactIds } },
          select: { id: true }
        });
        const artifactFeedbackIds = artifactFeedback.map((f) => f.id);
        if (artifactFeedbackIds.length > 0) {
          await tx.marker.deleteMany({ where: { feedbackId: { in: artifactFeedbackIds } } });
          await tx.feedback.deleteMany({ where: { id: { in: artifactFeedbackIds } } });
        }
        await tx.artifact.deleteMany({ where: { id: { in: artifactIds } } });
      }

      const entryFeedback = await tx.feedback.findMany({
        where: { targetType: 'entry', targetId: entryId },
        select: { id: true }
      });
      const entryFeedbackIds = entryFeedback.map((f) => f.id);
      if (entryFeedbackIds.length > 0) {
        await tx.marker.deleteMany({ where: { feedbackId: { in: entryFeedbackIds } } });
        await tx.feedback.deleteMany({ where: { id: { in: entryFeedbackIds } } });
      }
      await tx.practiceEntry.delete({ where: { id: entryId } });
    });

    // 2. After successful DB deletion, clean up S3 storage
    // If this fails, we log the error but don't fail the request (DB is already clean)
    // These orphaned objects can be cleaned up later via a maintenance job
    for (const storageKey of storageKeys) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: storageKey })
        );
      } catch (err) {
        request.log.error({ err, storageKey }, 'Failed to delete S3 object after entry deletion');
      }
    }

    return { success: true };
  });

  app.post('/entries/:entryId/submit', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    const roleInCourse = await requireCourseRole(prisma, user.id, entry.courseId);
    if (roleInCourse !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can submit');
    }
    if (entry.status !== 'draft') {
      throw new ApiError(409, 'ENTRY_LOCKED', 'Only draft entries can be submitted');
    }
    const artifacts = await prisma.artifact.findMany({ where: { entryId } });
    if (artifacts.length === 0 || artifacts.some((a) => a.uploadState !== 'uploaded')) {
      throw new ApiError(409, 'ARTIFACTS_NOT_UPLOADED', 'Upload artifacts before submitting');
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
