import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { S3Client } from '@aws-sdk/client-s3';
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
  s3: S3Client,
  requireAuth: (request: unknown) => Promise<void>
) {
  app.post('/entries/:entryId/artifacts', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await prisma.practiceEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.deletedAt) {
      throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
    }
    const roleInCourse = await requireCourseRole(prisma, user.id, entry.courseId);
    if (roleInCourse !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ARTIFACT_ACCESS_DENIED', 'Only the student owner can add artifacts');
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
    if (artifact.entry.deletedAt) {
      throw new ApiError(410, 'ENTRY_DELETED', 'Entry has been deleted');
    }
    // Use course role for authorization
    const roleInCourse = await requireCourseRole(prisma, user.id, artifact.entry.courseId);
    if (roleInCourse !== 'student' || artifact.entry.studentId !== user.id) {
      throw new ApiError(403, 'ARTIFACT_ACCESS_DENIED', 'Only the student owner can presign artifacts');
    }
    // Generate new storage key if not already set (avoid overwriting existing)
    const storageKey = artifact.storageKey ?? `artifacts/${artifact.entryId}/${artifact.id}`;
    const contentType = artifact.type === 'audio' ? 'audio/m4a' : 'video/mp4';
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      ContentType: contentType
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: config.s3.presignTtlSeconds
    });
    // Only update storageKey and uploadState if not already uploaded
    if (artifact.uploadState !== 'uploaded') {
      await prisma.artifact.update({
        where: { id: artifactId },
        data: { storageKey, uploadState: 'uploading' }
      });
    }
    return {
      uploadUrl,
      storageKey,
      expiresInSeconds: config.s3.presignTtlSeconds,
      requiredHeaders: { 'Content-Type': contentType }
    };
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
    // Check if entry is deleted
    if (artifact.entry.deletedAt) {
      throw new ApiError(410, 'ENTRY_DELETED', 'Entry has been deleted');
    }
    // Use course role for authorization
    const roleInCourse = await requireCourseRole(prisma, user.id, artifact.entry.courseId);
    if (roleInCourse !== 'student' || artifact.entry.studentId !== user.id) {
      throw new ApiError(403, 'ARTIFACT_ACCESS_DENIED', 'Only the student owner can confirm artifacts');
    }
    if (!artifact.storageKey) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Artifact missing storage key');
    }
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: config.s3.bucket, Key: artifact.storageKey })
      );
      if (!head.ContentLength || head.ContentLength === 0) {
        throw new Error('Empty file');
      }
    } catch (err) {
      request.log.error(err);
      throw new ApiError(409, 'UPLOAD_INVALID', 'Upload not found or empty in storage');
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
