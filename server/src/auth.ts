import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { PrismaClient, User } from '@prisma/client';
import { config } from './config.js';
import { ApiError } from './errors.js';

const devAuthCodes = new Map<string, { userId: string; expiresAt: number }>();

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user: User) {
  const expiresIn = config.accessTokenTtlMinutes * 60;
  return jwt.sign(
    { sub: user.id, role: user.globalRole },
    config.jwtSecret,
    { expiresIn }
  );
}

export function signRefreshToken(user: User, tokenId: string) {
  const expiresIn = config.refreshTokenTtlDays * 24 * 60 * 60;
  return jwt.sign(
    { sub: user.id, jti: tokenId },
    config.jwtSecret,
    { expiresIn }
  );
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}

export function verifyRefreshToken(token: string) {
  try {
    return jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new ApiError(401, 'INVALID_REFRESH', 'Invalid or expired refresh token');
  }
}

export async function issueTokens(prisma: PrismaClient, user: User) {
  const tokenId = `rt_${nanoid(24)}`;
  const refreshToken = signRefreshToken(user, tokenId);
  const accessToken = signAccessToken(user);

  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt
    }
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(prisma: PrismaClient, refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenId = payload.jti as string | undefined;
  const userId = payload.sub as string | undefined;

  if (!tokenId || !userId) {
    throw new ApiError(401, 'INVALID_REFRESH', 'Invalid refresh token payload');
  }

  const record = await prisma.refreshToken.findUnique({ where: { id: tokenId } });
  if (!record || record.revokedAt) {
    throw new ApiError(401, 'REFRESH_REVOKED', 'Refresh token has been revoked');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, 'REFRESH_EXPIRED', 'Refresh token expired');
  }

  if (record.tokenHash !== hashToken(refreshToken)) {
    throw new ApiError(401, 'REFRESH_MISMATCH', 'Refresh token mismatch');
  }

  await prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(401, 'USER_NOT_FOUND', 'User not found');
  }

  return issueTokens(prisma, user);
}

export function issueDevAuthCode(userId: string) {
  const code = `dev_${nanoid(18)}`;
  devAuthCodes.set(code, { userId, expiresAt: Date.now() + 5 * 60 * 1000 });
  return code;
}

export function consumeDevAuthCode(code: string) {
  const record = devAuthCodes.get(code);
  if (!record) {
    return null;
  }
  devAuthCodes.delete(code);
  if (record.expiresAt < Date.now()) {
    return null;
  }
  return record.userId;
}

export async function upsertDevUser(prisma: PrismaClient, role: 'student' | 'teacher', displayName?: string) {
  const id = role === 'teacher' ? 'dev-teacher' : 'dev-student';
  const user = await prisma.user.upsert({
    where: { id },
    update: {
      displayName: displayName ?? (role === 'teacher' ? 'Dev Teacher' : 'Dev Student'),
      globalRole: role
    },
    create: {
      id,
      displayName: displayName ?? (role === 'teacher' ? 'Dev Teacher' : 'Dev Student'),
      globalRole: role
    }
  });

  const courseId = 'COURSE_101';
  await prisma.course.upsert({
    where: { id: courseId },
    update: { title: 'Piano Technique 101' },
    create: { id: courseId, title: 'Piano Technique 101' }
  });

  await prisma.membership.upsert({
    where: { userId_courseId: { userId: id, courseId } },
    update: { roleInCourse: role },
    create: { userId: id, courseId, roleInCourse: role }
  });

  return user;
}
