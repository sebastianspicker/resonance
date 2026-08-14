// Characterizes DB-free v1 read routes through Fastify injection and strict dependency seams.
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

import type { PrismaClient } from '@prisma/client';
import { ErrorCodes } from '../src/errorCodes.js';
import { ApiError, sendError } from '../src/errors.js';
import { registerV1Routes } from '../src/routes/v1.js';

const ENTRY_ORDER = [
  { practiceDate: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];
const ENTRY_INCLUDE = { artifacts: true, captureMarkers: true };

type PrismaSeams = {
  user: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  membership: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  practiceEntry: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  artifact: { findUnique: ReturnType<typeof vi.fn> };
};

function createPrismaSeams(): { prisma: PrismaClient; seams: PrismaSeams } {
  const seams: PrismaSeams = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    membership: { findUnique: vi.fn(), findMany: vi.fn() },
    practiceEntry: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    artifact: { findUnique: vi.fn() },
  };
  return { prisma: seams as unknown as PrismaClient, seams };
}

function createRouteApp(prisma: PrismaClient): { app: FastifyInstance; s3: S3Client } {
  const app = Fastify();
  const s3 = {} as S3Client;
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) return sendError(reply, error);
    throw error;
  });
  registerV1Routes(app, prisma, s3, async (request: FastifyRequest) => {
    const [id, role] = String(request.headers['x-test-user'] ?? 'student-1:student').split(':');
    request.user = { id, role: role as 'student' | 'teacher' };
  });
  return { app, s3 };
}

function expectApiError(
  response: Awaited<ReturnType<FastifyInstance['inject']>>,
  statusCode: number,
  code: string,
  message: string
) {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toEqual({ error: { code, message, details: {} } });
}

function entry(id: string, studentId = 'student-1', captureMarkers: unknown[] = []) {
  return {
    id,
    courseId: 'course-1',
    studentId,
    practiceDate: new Date('2026-08-01T10:00:00.000Z'),
    createdAt: new Date('2026-08-01T11:00:00.000Z'),
    status: 'submitted',
    artifacts: [],
    captureMarkers,
  };
}

beforeEach(() => {
  getSignedUrlMock.mockResolvedValue('https://signed.example/download');
});

afterEach(() => {
  getSignedUrlMock.mockReset();
});

describe('v1 DB-free read routes', () => {
  it('projects the authenticated user and returns the exact missing-user error', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.user.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      displayName: 'Ada Student',
      globalRole: 'student',
    });
    seams.user.findUnique.mockResolvedValueOnce(null);
    const { app } = createRouteApp(prisma);

    try {
      const found = await app.inject({ method: 'GET', url: '/api/v1/me' });
      expect(found.statusCode).toBe(200);
      expect(found.json()).toEqual({
        id: 'student-1',
        displayName: 'Ada Student',
        globalRole: 'student',
      });
      expect(seams.user.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 'student-1' },
        select: { id: true, displayName: true, globalRole: true },
      });

      const missing = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { 'x-test-user': 'missing-user:student' },
      });
      expectApiError(missing, 404, ErrorCodes.NOT_FOUND, 'User not found');
      expect(seams.user.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: 'missing-user' },
        select: { id: true, displayName: true, globalRole: true },
      });
    } finally {
      await app.close();
    }
  });

  it('orders course memberships and projects the mobile course shape', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.membership.findMany.mockResolvedValue([
      { roleInCourse: 'student', course: { id: 'course-1', title: 'Rhythm', secret: 'x' } },
      { roleInCourse: 'teacher', course: { id: 'course-2', title: 'Harmony', secret: 'y' } },
    ]);
    const { app } = createRouteApp(prisma);

    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/courses' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { id: 'course-1', title: 'Rhythm', roleInCourse: 'student' },
        { id: 'course-2', title: 'Harmony', roleInCourse: 'teacher' },
      ]);
      expect(seams.membership.findMany).toHaveBeenCalledWith({
        where: { userId: 'student-1' },
        include: { course: true },
        orderBy: { courseId: 'asc' },
      });
    } finally {
      await app.close();
    }
  });

  it('scopes student entries, uses the 50-item default, clamps limits, and emits nextCursor', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'student' });
    seams.practiceEntry.findMany.mockResolvedValueOnce(
      Array.from({ length: 51 }, (_, index) => entry(`entry-${index}`))
    );
    seams.practiceEntry.findMany.mockResolvedValueOnce([]);
    const { app } = createRouteApp(prisma);

    try {
      const defaultPage = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries?status=reviewed',
      });
      expect(defaultPage.statusCode).toBe(200);
      expect(defaultPage.json()).toMatchObject({
        items: Array.from({ length: 50 }, (_, index) => ({ id: `entry-${index}` })),
        nextCursor: 'entry-49',
      });
      expect(seams.practiceEntry.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          courseId: 'course-1',
          deletedAt: null,
          studentId: 'student-1',
          status: 'reviewed',
        },
        include: ENTRY_INCLUDE,
        orderBy: ENTRY_ORDER,
        take: 51,
      });

      const clamped = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries?limit=999',
      });
      expect(clamped.statusCode).toBe(200);
      expect(seams.practiceEntry.findMany).toHaveBeenNthCalledWith(2, {
        where: { courseId: 'course-1', deletedAt: null, studentId: 'student-1' },
        include: ENTRY_INCLUDE,
        orderBy: ENTRY_ORDER,
        take: 201,
      });
    } finally {
      await app.close();
    }
  });

  it('defaults teachers to submitted entries, rejects draft access, and validates absent cursors', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'teacher' });
    seams.practiceEntry.findMany.mockResolvedValue([]);
    seams.practiceEntry.findFirst.mockResolvedValue(null);
    const { app } = createRouteApp(prisma);

    try {
      const defaultPage = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expect(defaultPage.statusCode).toBe(200);
      expect(seams.practiceEntry.findMany).toHaveBeenCalledWith({
        where: { courseId: 'course-1', deletedAt: null, status: 'submitted' },
        include: ENTRY_INCLUDE,
        orderBy: ENTRY_ORDER,
        take: 51,
      });

      const draft = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries?status=draft',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expectApiError(
        draft,
        403,
        ErrorCodes.ENTRY_ACCESS_DENIED,
        'Draft entries are not visible to teachers'
      );
      expect(seams.practiceEntry.findMany).toHaveBeenCalledTimes(1);

      const absentCursor = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries?cursor=missing-cursor',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expectApiError(absentCursor, 400, ErrorCodes.VALIDATION_ERROR, 'Invalid cursor');
      expect(seams.practiceEntry.findFirst).toHaveBeenCalledWith({
        where: { courseId: 'course-1', deletedAt: null, status: 'submitted', id: 'missing-cursor' },
        select: { practiceDate: true, createdAt: true, id: true },
      });
    } finally {
      await app.close();
    }
  });

  it('uses the descending practice-date, created-at, and id tuple for a valid cursor', async () => {
    const { prisma, seams } = createPrismaSeams();
    const practiceDate = new Date('2026-08-02T00:00:00.000Z');
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'teacher' });
    seams.practiceEntry.findFirst.mockResolvedValue({ id: 'cursor-1', practiceDate, createdAt });
    seams.practiceEntry.findMany.mockResolvedValue([]);
    const { app } = createRouteApp(prisma);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/entries?cursor=cursor-1&limit=3',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expect(response.statusCode).toBe(200);
      expect(seams.practiceEntry.findMany).toHaveBeenCalledWith({
        where: {
          courseId: 'course-1',
          deletedAt: null,
          status: 'submitted',
          OR: [
            { practiceDate: { lt: practiceDate } },
            { practiceDate, createdAt: { lt: createdAt } },
            { practiceDate, createdAt, id: { lt: 'cursor-1' } },
          ],
        },
        include: ENTRY_INCLUDE,
        orderBy: ENTRY_ORDER,
        take: 4,
      });
    } finally {
      await app.close();
    }
  });

  it('keeps review queues teacher-only and decorates submitted entries with deduplicated student names', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.membership.findUnique.mockResolvedValueOnce({ roleInCourse: 'student' });
    seams.membership.findUnique.mockResolvedValueOnce({ roleInCourse: 'teacher' });
    seams.practiceEntry.findMany.mockResolvedValue([
      entry('entry-1', 'student-1', [{ atSeconds: 1 }, { atSeconds: 2 }]),
      entry('entry-2', 'student-1', [{ atSeconds: 3 }]),
      entry('entry-3', 'student-2'),
      entry('entry-4', 'student-2'),
    ]);
    seams.user.findMany.mockResolvedValue([{ id: 'student-1', displayName: 'Ada Student' }]);
    const { app } = createRouteApp(prisma);

    try {
      const student = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/review-queue',
      });
      expectApiError(student, 403, ErrorCodes.TEACHER_ONLY, 'Only teachers can access the review queue');
      expect(seams.practiceEntry.findMany).not.toHaveBeenCalled();

      const teacher = await app.inject({
        method: 'GET',
        url: '/api/v1/courses/course-1/review-queue?limit=3',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expect(teacher.statusCode).toBe(200);
      expect(teacher.json()).toMatchObject({
        items: [
          { id: 'entry-1', studentName: 'Ada Student', captureMarkerCount: 2 },
          { id: 'entry-2', studentName: 'Ada Student', captureMarkerCount: 1 },
          { id: 'entry-3', studentName: '', captureMarkerCount: 0 },
        ],
        nextCursor: 'entry-3',
      });
      expect(seams.practiceEntry.findMany).toHaveBeenCalledWith({
        where: { courseId: 'course-1', status: 'submitted', deletedAt: null },
        include: ENTRY_INCLUDE,
        orderBy: ENTRY_ORDER,
        take: 4,
      });
      expect(seams.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['student-1', 'student-2'] } },
        select: { id: true, displayName: true },
      });
    } finally {
      await app.close();
    }
  });

  it('returns the entry-not-found shape and delegates an existing entry to visibility checks', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.practiceEntry.findUnique.mockResolvedValueOnce(null);
    seams.practiceEntry.findUnique.mockResolvedValueOnce(entry('entry-1'));
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'teacher' });
    const { app } = createRouteApp(prisma);

    try {
      const missing = await app.inject({ method: 'GET', url: '/api/v1/entries/missing-entry' });
      expectApiError(missing, 404, ErrorCodes.ENTRY_NOT_FOUND, 'Entry not found');

      const visible = await app.inject({
        method: 'GET',
        url: '/api/v1/entries/entry-1',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expect(visible.statusCode).toBe(200);
      expect(visible.json()).toMatchObject({ id: 'entry-1', studentId: 'student-1' });
      expect(seams.practiceEntry.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: 'entry-1' },
        include: ENTRY_INCLUDE,
      });
      expect(seams.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_courseId: { userId: 'teacher-1', courseId: 'course-1' } },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects absent, nonuploaded, and keyless artifacts with the exact not-found shape', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.artifact.findUnique.mockResolvedValueOnce(null);
    seams.artifact.findUnique.mockResolvedValueOnce({ uploadState: 'uploading', storageKey: 'staging/key' });
    seams.artifact.findUnique.mockResolvedValueOnce({ uploadState: 'uploaded', storageKey: null });
    const { app } = createRouteApp(prisma);

    try {
      for (const artifactId of ['absent', 'nonuploaded', 'keyless']) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/v1/artifacts/${artifactId}/download-session`,
        });
        expectApiError(response, 404, ErrorCodes.ARTIFACT_NOT_FOUND, 'Artifact not found');
      }
      expect(seams.artifact.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 'absent' },
        include: { entry: true },
      });
      expect(seams.artifact.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: 'nonuploaded' },
        include: { entry: true },
      });
      expect(seams.artifact.findUnique).toHaveBeenNthCalledWith(3, {
        where: { id: 'keyless' },
        include: { entry: true },
      });
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects teachers from presigning a draft artifact and does not call storage', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.artifact.findUnique.mockResolvedValue({
      id: 'artifact-draft',
      uploadState: 'uploaded',
      storageKey: 'artifacts/final/entry-draft/artifact-draft',
      entry: { ...entry('entry-draft'), status: 'draft' },
    });
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'teacher' });
    const { app } = createRouteApp(prisma);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artifacts/artifact-draft/download-session',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expectApiError(
        response,
        403,
        ErrorCodes.ENTRY_ACCESS_DENIED,
        'Draft entries are not visible to teachers'
      );
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('creates a no-store 900-second download session with the configured bucket and artifact key', async () => {
    const { prisma, seams } = createPrismaSeams();
    seams.artifact.findUnique.mockResolvedValue({
      id: 'artifact-1',
      uploadState: 'uploaded',
      storageKey: 'artifacts/final/entry-1/artifact-1',
      entry: entry('entry-1'),
    });
    seams.membership.findUnique.mockResolvedValue({ roleInCourse: 'teacher' });
    const { app, s3 } = createRouteApp(prisma);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/artifacts/artifact-1/download-session',
        headers: { 'x-test-user': 'teacher-1:teacher' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({
        downloadUrl: 'https://signed.example/download',
        expiresInSeconds: 900,
      });
      expect(seams.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_courseId: { userId: 'teacher-1', courseId: 'course-1' } },
      });
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
      expect(getSignedUrlMock).toHaveBeenCalledWith(s3, expect.any(GetObjectCommand), {
        expiresIn: 900,
      });
      const command = getSignedUrlMock.mock.calls[0][1] as GetObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'resonance-dev',
        Key: 'artifacts/final/entry-1/artifact-1',
      });
    } finally {
      await app.close();
    }
  });
});
