import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { PrismaClient } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { ApiError, sendError } from './errors.js';
import {
  verifyAccessToken,
  issueTokens,
  rotateRefreshToken,
  issueDevAuthCode,
  consumeDevAuthCode,
  upsertDevUser
} from './auth.js';
import { AuthUser } from './types.js';

function requireField<T>(value: T | undefined | null, name: string) {
  if (value === undefined || value === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Missing field: ${name}`);
  }
  return value;
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid string: ${name}`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]) {
  const str = requireString(value, name) as T;
  if (!allowed.includes(str)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid enum value: ${name}`);
  }
  return str;
}

function requireStringArray(value: unknown, name: string) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid array: ${name}`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', `Invalid array element: ${name}`);
    }
  }
  return value as string[];
}

function requireValidDate(value: unknown, name: string): Date {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid date: ${name}`);
  }
  return date;
}

function requireNumber(value: unknown, name: string, options?: { min?: number; max?: number }) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid number: ${name}`);
  }
  if (options?.min !== undefined && value < options.min) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Number too small: ${name}`);
  }
  if (options?.max !== undefined && value > options.max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Number too large: ${name}`);
  }
  return value;
}

async function requireCourseRole(prisma: PrismaClient, userId: string, courseId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_courseId: { userId, courseId } }
  });
  if (!membership) {
    throw new ApiError(403, 'COURSE_ACCESS_DENIED', 'User is not a member of this course');
  }
  return membership.roleInCourse;
}

async function requireEntryAccess(prisma: PrismaClient, user: AuthUser, entryId: string) {
  const entry = await prisma.practiceEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
  }
  if (entry.deletedAt) {
    throw new ApiError(410, 'ENTRY_DELETED', 'Entry has been deleted');
  }

  await requireCourseRole(prisma, user.id, entry.courseId);

  if (user.role === 'student' && entry.studentId !== user.id) {
    throw new ApiError(403, 'ENTRY_ACCESS_DENIED', 'Entry does not belong to student');
  }

  return entry;
}

export function buildServer(prisma: PrismaClient, s3: any) {
  const app = Fastify({ logger: true });

  const corsOrigin = config.corsOrigins.length > 0 ? config.corsOrigins : true;
  app.register(cors, { origin: corsOrigin });
  app.register(helmet);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(reply, error);
    }

    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error',
        details: {}
      }
    });
  });

  app.setNotFoundHandler((request, reply) => {
    sendError(reply, new ApiError(404, 'NOT_FOUND', 'Route not found'));
  });

  const requireAuth = async (request: any) => {
    const header = request.headers.authorization;
    if (!header) {
      throw new ApiError(401, 'MISSING_AUTH', 'Missing Authorization header');
    }
    const token = header.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    const userId = payload.sub as string | undefined;
    const role = payload.role as 'student' | 'teacher' | undefined;
    if (!userId || !role) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid token payload');
    }
    request.user = { id: userId, role };
  };

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/dev/login', async (request, reply) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }

    const html = `<!doctype html>
<html>
  <head><title>Resonance Dev Login</title></head>
  <body>
    <h1>Resonance Dev Login</h1>
    <p>Select a role to continue.</p>
    <ul>
      <li><a href="/dev/authorize?role=student">Login as Student</a></li>
      <li><a href="/dev/authorize?role=teacher">Login as Teacher</a></li>
    </ul>
  </body>
</html>`;

    reply.type('text/html').send(html);
  });

  app.get('/dev/authorize', async (request, reply) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }

    const role = (request.query as any).role as 'student' | 'teacher' | undefined;
    if (!role || (role !== 'student' && role !== 'teacher')) {
      throw new ApiError(400, 'INVALID_ROLE', 'Invalid role');
    }

    const user = await upsertDevUser(prisma, role);
    const code = issueDevAuthCode(user.id);
    const redirectUrl = new URL(config.devLoginCallbackUrl);
    redirectUrl.searchParams.set('code', code);

    reply.redirect(redirectUrl.toString());
  });

  app.post('/dev/issue', async (request) => {
    if (config.authMode !== 'dev') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found');
    }
    const body = request.body as { role?: 'student' | 'teacher'; userId?: string };
    const role = body?.role ?? 'student';
    let user = null;
    if (body?.userId) {
      user = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!user) {
        throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
      }
    } else {
      user = await upsertDevUser(prisma, role);
    }
    const code = issueDevAuthCode(user.id);
    return { code };
  });

  app.post('/auth/session', async (request) => {
    const body = request.body as { code?: string; redirectUri?: string };
    const code = requireField(body?.code, 'code');

    if (config.authMode !== 'dev') {
      throw new ApiError(501, 'AUTH_NOT_CONFIGURED', 'Production auth not configured');
    }

    const userId = consumeDevAuthCode(code);
    if (!userId) {
      throw new ApiError(401, 'INVALID_CODE', 'Invalid or expired auth code');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(401, 'USER_NOT_FOUND', 'User not found');
    }

    const tokens = await issueTokens(prisma, user);
    return {
      ...tokens,
      user: { id: user.id, displayName: user.displayName, globalRole: user.globalRole }
    };
  });

  app.post('/auth/refresh', async (request) => {
    const body = request.body as { refreshToken?: string };
    const refreshToken = requireField(body?.refreshToken, 'refreshToken');
    const tokens = await rotateRefreshToken(prisma, refreshToken);
    return tokens;
  });

  app.get('/courses', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
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
    const user = request.user as AuthUser;
    const courseId = (request.params as any).courseId as string;
    await requireCourseRole(prisma, user.id, courseId);
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course not found');
    }
    return course;
  });

  app.get('/courses/:courseId/entries', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const courseId = (request.params as any).courseId as string;
    const role = await requireCourseRole(prisma, user.id, courseId);

    const where = role === 'teacher'
      ? { courseId, deletedAt: null }
      : { courseId, studentId: user.id, deletedAt: null };

    const entries = await prisma.practiceEntry.findMany({
      where,
      include: { artifacts: true }
    });
    return entries;
  });

  app.post('/courses/:courseId/entries', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const courseId = (request.params as any).courseId as string;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'student') {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only students can create entries');
    }

    const body = request.body as any;
    const entryId = requireString(requireField(body?.id, 'id'), 'id');
    const practiceDate = requireValidDate(body?.practiceDate, 'practiceDate');
    const goalText = requireString(requireField(body?.goalText, 'goalText'), 'goalText');
    const tags = body?.tags === undefined ? [] : requireStringArray(body.tags, 'tags');
    const durationSeconds = body?.durationSeconds === undefined
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
        notes: body?.notes ?? null,
        status: 'draft'
      }
    });

    return entry;
  });

  app.patch('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const entryId = (request.params as any).entryId as string;
    const entry = await requireEntryAccess(prisma, user, entryId);

    if (user.role !== 'student') {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only students can edit entries');
    }

    const body = request.body as any;
    if (entry.status === 'submitted') {
      if (body.goalText || body.practiceDate || body.tags || body.durationSeconds) {
        throw new ApiError(409, 'ENTRY_LOCKED', 'Submitted entries are restricted');
      }
    }

    const updated = await prisma.practiceEntry.update({
      where: { id: entryId },
      data: {
        goalText: body.goalText ?? entry.goalText,
        practiceDate: body.practiceDate ? requireValidDate(body.practiceDate, 'practiceDate') : entry.practiceDate,
        durationSeconds: body.durationSeconds === undefined
          ? entry.durationSeconds
          : requireNumber(body.durationSeconds, 'durationSeconds', { min: 0 }),
        tags: body.tags === undefined ? entry.tags : requireStringArray(body.tags, 'tags'),
        notes: body.notes ?? entry.notes
      }
    });

    return updated;
  });

  app.delete('/entries/:entryId', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const entryId = (request.params as any).entryId as string;
    const entry = await requireEntryAccess(prisma, user, entryId);

    if (user.role !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can delete');
    }

    const artifacts = await prisma.artifact.findMany({ where: { entryId } });
    try {
      for (const artifact of artifacts) {
        if (artifact.storageKey) {
          await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: artifact.storageKey }));
        }
      }
    } catch (err) {
      request.log.error(err);
      throw new ApiError(502, 'STORAGE_DELETE_FAILED', 'Failed to delete artifact from storage');
    }

    await prisma.$transaction(async (tx) => {
      const artifactIds = artifacts.map((artifact) => artifact.id);

      if (artifactIds.length > 0) {
        const artifactFeedback = await tx.feedback.findMany({
          where: { targetType: 'artifact', targetId: { in: artifactIds } },
          select: { id: true }
        });
        const artifactFeedbackIds = artifactFeedback.map((feedback) => feedback.id);
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
      const entryFeedbackIds = entryFeedback.map((feedback) => feedback.id);
      if (entryFeedbackIds.length > 0) {
        await tx.marker.deleteMany({ where: { feedbackId: { in: entryFeedbackIds } } });
        await tx.feedback.deleteMany({ where: { id: { in: entryFeedbackIds } } });
      }

      await tx.practiceEntry.delete({ where: { id: entryId } });
    });

    return { success: true };
  });

  app.post('/entries/:entryId/submit', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const entryId = (request.params as any).entryId as string;
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

  app.post('/entries/:entryId/artifacts', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const entryId = (request.params as any).entryId as string;
    const entry = await requireEntryAccess(prisma, user, entryId);

    if (user.role !== 'student' || entry.studentId !== user.id) {
      throw new ApiError(403, 'ONLY_STUDENTS', 'Only the student owner can add artifacts');
    }

    const body = request.body as any;
    const artifactId = requireString(requireField(body?.id, 'id'), 'id');
    const type = requireEnum(requireField(body?.type, 'type'), 'type', ['audio', 'video'] as const);
    const durationSeconds = requireNumber(requireField(body?.durationSeconds, 'durationSeconds'), 'durationSeconds', { min: 0 });

    const artifact = await prisma.artifact.create({
      data: {
        id: artifactId,
        entryId,
        type,
        durationSeconds
      }
    });

    return artifact;
  });

  app.post('/artifacts/:artifactId/presign', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const artifactId = (request.params as any).artifactId as string;

    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId }, include: { entry: true } });
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

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: config.s3.presignTtlSeconds });

    await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        storageKey,
        uploadState: 'uploading'
      }
    });

    return { uploadUrl, storageKey, expiresInSeconds: config.s3.presignTtlSeconds };
  });

  app.post('/artifacts/:artifactId/confirm', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const artifactId = (request.params as any).artifactId as string;

    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId }, include: { entry: true } });
    if (!artifact) {
      throw new ApiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
    }

    await requireCourseRole(prisma, user.id, artifact.entry.courseId);

    if (!artifact.storageKey) {
      throw new ApiError(400, 'MISSING_STORAGE_KEY', 'Artifact missing storage key');
    }

    const headCommand = new HeadObjectCommand({
      Bucket: config.s3.bucket,
      Key: artifact.storageKey
    });

    try {
      await s3.send(headCommand);
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

  app.get('/courses/:courseId/review-queue', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const courseId = (request.params as any).courseId as string;
    const role = await requireCourseRole(prisma, user.id, courseId);
    if (role !== 'teacher') {
      throw new ApiError(403, 'ONLY_TEACHERS', 'Only teachers can access the review queue');
    }

    const entries = await prisma.practiceEntry.findMany({
      where: { courseId, status: 'submitted', deletedAt: null },
      include: { artifacts: true, student: true }
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

  app.post('/feedback', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== 'teacher') {
      throw new ApiError(403, 'ONLY_TEACHERS', 'Only teachers can leave feedback');
    }

    const body = request.body as any;
    const targetType = requireEnum(requireField(body?.targetType, 'targetType'), 'targetType', ['entry', 'artifact'] as const);
    const targetId = requireString(requireField(body?.targetId, 'targetId'), 'targetId');
    const status = requireEnum(requireField(body?.status, 'status'), 'status', ['ok', 'needs_revision', 'next_goal'] as const);
    const commentsText = requireString(requireField(body?.commentsText, 'commentsText'), 'commentsText');
    const markers = Array.isArray(body?.markers) ? body.markers : [];

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
      const artifact = await prisma.artifact.findUnique({ where: { id: targetId }, include: { entry: true } });
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
          create: markers.map((marker: any) => ({
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

  app.get('/entries/:entryId/feedback', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const entryId = (request.params as any).entryId as string;
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

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = request.user as AuthUser;
    const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
    if (!userRecord) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return { id: userRecord.id, displayName: userRecord.displayName, globalRole: userRecord.globalRole };
  });

  return app;
}
