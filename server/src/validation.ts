import { PrismaClient } from '@prisma/client';
import { ApiError } from './errors.js';
import { AuthUser } from './types.js';

export function requireField<T>(value: T | undefined | null, name: string) {
  if (value === undefined || value === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Missing field: ${name}`);
  }
  return value;
}

export function requireString(value: unknown, name: string, options?: { max?: number }) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid string: ${name}`);
  }
  const max = options?.max ?? 10000;
  if (value.length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `String too long: ${name} (max ${max})`);
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

export function requireStringArray(value: unknown, name: string, options?: { max?: number }) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid array: ${name}`);
  }
  const max = options?.max ?? 100;
  if (value.length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Array too large: ${name} (max ${max})`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', `Invalid array element: ${name}`);
    }
  }
  return value as string[];
}

export function requireValidDate(value: unknown, name: string): Date {
  const str = String(value);
  // Basic ISO 8601 regex (YYYY-MM-DDTHH:mm:ss.sssZ)
  const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
  if (!isoRegex.test(str)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid date format: ${name}. Expected ISO 8601.`);
  }
  const date = new Date(str);
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

  // Use course role for authorization, not global role
  const roleInCourse = await requireCourseRole(prisma, user.id, entry.courseId);

  // Students can only access their own entries
  if (roleInCourse === 'student' && entry.studentId !== user.id) {
    throw new ApiError(403, 'ENTRY_ACCESS_DENIED', 'Entry does not belong to student');
  }

  return entry;
}

/**
 * Require that the user is a teacher in the specified course.
 * Throws 403 if the user is not a teacher or admin.
 */
export async function requireTeacherRole(prisma: PrismaClient, userId: string, courseId: string) {
  const roleInCourse = await requireCourseRole(prisma, userId, courseId);
  if (roleInCourse !== 'teacher') {
    throw new ApiError(403, 'TEACHER_REQUIRED', 'Only teachers can perform this action');
  }
  return roleInCourse;
}

/**
 * Optional field helper - returns undefined if field is not present or is null/undefined.
 * Useful for PATCH operations where only provided fields should be updated.
 */
export function optionalField<T>(value: T | undefined | null): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value;
}

/**
 * Check if a field is present in the request body (even if null).
 * Used to distinguish between "not provided" and "explicitly set to null/empty".
 */
export function hasField(body: unknown, field: string): boolean {
  if (body && typeof body === 'object') {
    return field in body;
  }
  return false;
}

/**
 * Require that an entry is in draft status (editable by student).
 * Throws 400 if the entry is already submitted.
 */
export function requireDraftEntry(entry: { status: string }) {
  if (entry.status !== 'draft') {
    throw new ApiError(400, 'ENTRY_NOT_EDITABLE', 'Entry has already been submitted and cannot be modified');
  }
  return entry;
}

/**
 * Require that an entry is in submitted status (reviewable by teacher).
 * Throws 400 if the entry is not submitted.
 */
export function requireSubmittedEntry(entry: { status: string }) {
  if (entry.status !== 'submitted') {
    throw new ApiError(400, 'ENTRY_NOT_SUBMITTED', 'Entry must be submitted before feedback can be added');
  }
  return entry;
}
