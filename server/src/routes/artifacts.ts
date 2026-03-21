import type { S3Client } from '@aws-sdk/client-s3';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ErrorCodes } from '../errorCodes.js';
import { ApiError } from '../errors.js';
import {
  requireClientId,
  requireEnum,
  requireField,
  requireNumber,
  requireStudentOwner,
} from '../validation.js';

export function registerArtifactRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  s3: S3Client,
  requireAuth: (request: FastifyRequest) => Promise<void>
) {
  app.post('/entries/:entryId/artifacts', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const entryId = (request.params as { entryId: string }).entryId;
    const entry = await prisma.practiceEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.deletedAt) {
      throw new ApiError(404, ErrorCodes.ENTRY_NOT_FOUND, 'Entry not found');
    }
    await requireStudentOwner(prisma, user.id, entry, 'add artifacts');
    const body = request.body as Record<string, unknown>;
    const artifactId = requireClientId(requireField(body?.id, 'id'), 'id');
    const type = requireEnum(requireField(body?.type, 'type'), 'type', ['audio', 'video'] as const);
    const durationSeconds = requireNumber(
      requireField(body?.durationSeconds, 'durationSeconds'),
      'durationSeconds',
      { min: 0 }
    );
    try {
      const artifact = await prisma.artifact.create({
        data: { id: artifactId, entryId, type, durationSeconds },
      });
      return artifact;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ApiError(
          409,
          ErrorCodes.ID_CONFLICT,
          'An artifact with this ID already exists'
        );
      }
      throw err;
    }
  });

  app.post('/artifacts/:artifactId/presign', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const artifactId = (request.params as { artifactId: string }).artifactId;
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { entry: true },
    });
    if (!artifact) {
      throw new ApiError(404, ErrorCodes.ARTIFACT_NOT_FOUND, 'Artifact not found');
    }
    if (artifact.entry.deletedAt) {
      throw new ApiError(410, ErrorCodes.ENTRY_DELETED, 'Entry has been deleted');
    }
    await requireStudentOwner(prisma, user.id, artifact.entry, 'presign artifacts');
    // Generate new storage key if not already set (avoid overwriting existing)
    const storageKey = artifact.storageKey ?? `artifacts/${artifact.entryId}/${artifact.id}`;
    const contentType = artifact.type === 'audio' ? 'audio/m4a' : 'video/mp4';
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: config.s3.presignTtlSeconds,
    });
    // Only update storageKey and uploadState if not already uploaded
    if (artifact.uploadState !== 'uploaded') {
      await prisma.artifact.update({
        where: { id: artifactId },
        data: { storageKey, uploadState: 'uploading' },
      });
    }
    return {
      uploadUrl,
      storageKey,
      expiresInSeconds: config.s3.presignTtlSeconds,
      requiredHeaders: { 'Content-Type': contentType },
    };
  });

  app.post('/artifacts/:artifactId/confirm', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const artifactId = (request.params as { artifactId: string }).artifactId;
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { entry: true },
    });
    if (!artifact) {
      throw new ApiError(404, ErrorCodes.ARTIFACT_NOT_FOUND, 'Artifact not found');
    }
    if (artifact.entry.deletedAt) {
      throw new ApiError(410, ErrorCodes.ENTRY_DELETED, 'Entry has been deleted');
    }
    await requireStudentOwner(prisma, user.id, artifact.entry, 'confirm artifacts');
    if (!artifact.storageKey) {
      throw new ApiError(400, ErrorCodes.MISSING_STORAGE_KEY, 'Artifact missing storage key');
    }
    let head;
    try {
      head = await s3.send(
        new HeadObjectCommand({ Bucket: config.s3.bucket, Key: artifact.storageKey })
      );
    } catch (err) {
      request.log.error(err);
      throw new ApiError(409, ErrorCodes.UPLOAD_INVALID, 'Upload not found in storage');
    }
    if (!head.ContentLength || head.ContentLength === 0) {
      throw new ApiError(409, ErrorCodes.UPLOAD_INVALID, 'Uploaded file is empty');
    }
    const updated = await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        uploadState: 'uploaded',
        remoteUrl: `s3://${config.s3.bucket}/${artifact.storageKey}`,
      },
    });
    return updated;
  });
}
