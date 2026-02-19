import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
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
  s3: { send: (cmd: unknown) => Promise<unknown> },
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
    const entry = await prisma.practiceEntry.create({
      data: {
        id: entryId,
        courseId,
        studentId: user.id,
        practiceDate,
        goalText,
        durationSeconds,
        tags,
        notes: (body?.notes as string | null) ?? null,
        status: 'draft'
      }
    });
    return entry;
  });

  app.patch('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    if (user.role !== 'student') {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only students can edit entries');
    }
    const body = request.body as Record<string, unknown>;
    if (entry.status === 'submitted') {
      if (body.goalText || body.practiceDate || body.tags || body.durationSeconds) {
        throw new ApiError(409, 'ENTRY_LOCKED', 'Submitted entries are restricted');
      }
    }
    const updated = await prisma.practiceEntry.update({
      where: { id: entryId },
      data: {
        goalText: (body.goalText as string) ?? entry.goalText,
        practiceDate: body.practiceDate
          ? requireValidDate(body.practiceDate, 'practiceDate')
          : entry.practiceDate,
        durationSeconds:
          body.durationSeconds === undefined
            ? entry.durationSeconds
            : requireNumber(body.durationSeconds, 'durationSeconds', { min: 0 }),
        tags: body.tags === undefined ? entry.tags : requireStringArray(body.tags, 'tags'),
        notes: (body.notes as string | null) ?? entry.notes
      }
    });
    return updated;
  });

  app.delete('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    if (user.role !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can delete');
    }
    const deletedArtifacts = await prisma.$transaction(async (tx) => {
      const artifacts = await tx.artifact.findMany({ where: { entryId } });
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
      return artifacts;
    });
    try {
      for (const artifact of deletedArtifacts) {
        if (artifact.storageKey) {
          await s3.send(
            new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: artifact.storageKey })
          );
        }
      }
    } catch (err) {
      request.log.error(err);
      throw new ApiError(502, 'STORAGE_DELETE_FAILED', 'Failed to delete artifact from storage');
    }
    return { success: true };
  });

  app.post('/entries/:entryId/submit', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await requireEntryAccess(prisma, user, entryId);
    if (user.role !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can submit');
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
