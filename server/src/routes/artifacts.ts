import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import {
  requireField,
  requireString,
  requireEnum,
  requireNumber,
  requireCourseRole
} from '../validation.js';

export function registerArtifactRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  s3: { send: (cmd: unknown) => Promise<unknown> },
  requireAuth: (request: unknown) => Promise<void>
) {
  app.post('/entries/:entryId/artifacts', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await prisma.practiceEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.deletedAt) {
      throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
    }
    await requireCourseRole(prisma, user.id, entry.courseId);
    if (user.role !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can add artifacts');
    }
    const body = request.body as Record<string, unknown>;
    const artifactId = requireString(requireField(body?.id, 'id'), 'id');
    const type = requireEnum(requireField(body?.type, 'type'), 'type', ['audio', 'video'] as const);
    const durationSeconds = requireNumber(
      requireField(body?.durationSeconds, 'durationSeconds'),
      'durationSeconds',
      { min: 0 }
    );
    const artifact = await prisma.artifact.create({
      data: { id: artifactId, entryId, type, durationSeconds }
    });
    return artifact;
  });

  app.post('/artifacts/:artifactId/presign', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const artifactId = (request.params as { artifactId: string }).artifactId;
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { entry: true }
    });
    if (!artifact) {
      throw new ApiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
    }
    await requireCourseRole(prisma, user.id, artifact.entry.courseId);
    if (user.role === 'student' && artifact.entry.studentId !== user.id) {
      throw new ApiError(403, 'ARTIFACT_ACCESS_DENIED', 'Artifact not owned by student');
    }
    const storageKey = artifact.storageKey ?? `artifacts/${artifact.entryId}/${artifact.id}`;
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      ContentType: artifact.type === 'audio' ? 'audio/m4a' : 'video/mp4'
    });
    const uploadUrl = await getSignedUrl(s3 as never, command, {
      expiresIn: config.s3.presignTtlSeconds
    });
    await prisma.artifact.update({
      where: { id: artifactId },
      data: { storageKey, uploadState: 'uploading' }
    });
    return { uploadUrl, storageKey, expiresInSeconds: config.s3.presignTtlSeconds };
  });

  app.post('/artifacts/:artifactId/confirm', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const artifactId = (request.params as { artifactId: string }).artifactId;
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { entry: true }
    });
    if (!artifact) {
      throw new ApiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
    }
    await requireCourseRole(prisma, user.id, artifact.entry.courseId);
    if (!artifact.storageKey) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Artifact missing storage key');
    }
    try {
      await s3.send(
        new HeadObjectCommand({ Bucket: config.s3.bucket, Key: artifact.storageKey })
      );
    } catch {
      throw new ApiError(409, 'UPLOAD_NOT_FOUND', 'Upload not found in storage');
    }
    const updated = await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        uploadState: 'uploaded',
        remoteUrl: `s3://${config.s3.bucket}/${artifact.storageKey}`
      }
    });
    return updated;
  });
}
