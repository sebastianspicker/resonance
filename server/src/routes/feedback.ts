import { nanoid } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../errors.js';
import {
  requireField,
  requireString,
  requireEnum,
  requireNumber,
  requireCourseRole
} from '../validation.js';

export function registerFeedbackRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  _s3: unknown,
  requireAuth: (request: unknown) => Promise<void>
) {
  app.post('/feedback', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    if (user.role !== 'teacher') {
      throw new ApiError(403, 'ONLY_TEACHERS', 'Only teachers can leave feedback');
    }
    const body = request.body as Record<string, unknown>;
    const targetType = requireEnum(
      requireField(body?.targetType, 'targetType'),
      'targetType',
      ['entry', 'artifact'] as const
    );
    const targetId = requireString(requireField(body?.targetId, 'targetId'), 'targetId');
    const status = requireEnum(
      requireField(body?.status, 'status'),
      'status',
      ['ok', 'needs_revision', 'next_goal'] as const
    );
    const commentsText = requireString(
      requireField(body?.commentsText, 'commentsText'),
      'commentsText'
    );
    const markers = Array.isArray(body?.markers) ? (body.markers as Record<string, unknown>[]) : [];
    for (const marker of markers) {
      requireNumber(marker?.timeSeconds, 'marker.timeSeconds', { min: 0 });
      requireString(requireField(marker?.text, 'marker.text'), 'marker.text');
    }
    if (targetType === 'entry') {
      const entry = await prisma.practiceEntry.findUnique({ where: { id: targetId } });
      if (!entry) {
        throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
      }
      await requireCourseRole(prisma, user.id, entry.courseId);
    } else if (targetType === 'artifact') {
      const artifact = await prisma.artifact.findUnique({
        where: { id: targetId },
        include: { entry: true }
      });
      if (!artifact) {
        throw new ApiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
      }
      await requireCourseRole(prisma, user.id, artifact.entry.courseId);
    } else {
      throw new ApiError(400, 'INVALID_TARGET', 'Invalid target type');
    }
    const feedbackId = `fb_${nanoid(12)}`;
    const feedback = await prisma.feedback.create({
      data: {
        id: feedbackId,
        targetType,
        targetId,
        teacherId: user.id,
        status,
        commentsText,
        markers: {
          create: markers.map((marker: Record<string, unknown>) => ({
            id: `mk_${nanoid(10)}`,
            timeSeconds: marker.timeSeconds,
            text: marker.text
          }))
        }
      },
      include: { markers: true }
    });
    return feedback;
  });
}
