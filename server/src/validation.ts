import { PrismaClient } from '@prisma/client';
import { ApiError } from './errors.js';
import { AuthUser } from './types.js';

export function requireField<T>(value: T | undefined | null, name: string) {
  if (value === undefined || value === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Missing field: ${name}`);
  }
  return value;
}

export function requireString(value: unknown, name: string) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid string: ${name}`);
  }
  return value;
}

export function requireEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]) {
  const str = requireString(value, name) as T;
  if (!allowed.includes(str)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid enum value: ${name}`);
  }
  return str;
}

export function requireStringArray(value: unknown, name: string) {
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

export function requireValidDate(value: unknown, name: string): Date {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid date: ${name}`);
  }
  return date;
}

export function requireNumber(value: unknown, name: string, options?: { min?: number; max?: number }) {
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

export async function requireCourseRole(prisma: PrismaClient, userId: string, courseId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_courseId: { userId, courseId } }
  });
  if (!membership) {
    throw new ApiError(403, 'COURSE_ACCESS_DENIED', 'User is not a member of this course');
  }
  return membership.roleInCourse;
}

export async function requireEntryAccess(prisma: PrismaClient, user: AuthUser, entryId: string) {
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
