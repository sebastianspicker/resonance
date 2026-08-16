// Unit-tests S3 bucket setup, presigning, copy verification, and bounded storage failures.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { config } from '../src/config.js';
import { buildCreateBucketInput, ensureBucket, isS3NotFoundError } from '../src/storage.js';

const s3Mock = mockClient(S3Client);

async function ensureConfiguredBucket() {
  await ensureBucket(new S3Client({}));
}

function s3Error(message: string, name: string, statusCode: number) {
  return Object.assign(new Error(message), { name, $metadata: { httpStatusCode: statusCode } });
}

function expectAbortState(
  send: { mock: { calls: unknown[][] } },
  callIndex: number,
  aborted: boolean
) {
  const [, options] = send.mock.calls[callIndex] ?? [];
  const signal = (options as { abortSignal?: AbortSignal } | undefined)?.abortSignal;
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal?.aborted).toBe(aborted);
}

describe('ensureBucket', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it.each([
    ['does not create bucket when HeadBucket succeeds', undefined, 0],
    ['creates bucket on 404 NotFound error', s3Error('Not Found', 'NotFound', 404), 1],
  ])('%s', async (_name, headError, expectedCreateCalls) => {
    if (headError) {
      s3Mock.on(HeadBucketCommand).rejects(headError);
    } else {
      s3Mock.on(HeadBucketCommand).resolves({});
    }
    s3Mock.on(CreateBucketCommand).resolves({});

    await ensureConfiguredBucket();

    expect(s3Mock.commandCalls(HeadBucketCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(expectedCreateCalls);
  });

  it('creates bucket on NoSuchBucket error', async () => {
    const noSuchBucketError = s3Error('No such bucket', 'NoSuchBucket', 404);
    s3Mock.on(HeadBucketCommand).rejects(noSuchBucketError);
    s3Mock.on(CreateBucketCommand).resolves({});

    const s3 = new S3Client({});
    const send = vi.spyOn(s3, 'send');
    await ensureBucket(s3);

    expect(s3Mock.commandCalls(CreateBucketCommand).length).toBe(1);
    expect(s3Mock.calls().map((call) => call.args[0])).toEqual([
      expect.any(HeadBucketCommand),
      expect.any(CreateBucketCommand),
    ]);
    expect(s3Mock.commandCalls(CreateBucketCommand)[0]?.args[0].input).toEqual(
      buildCreateBucketInput(config.s3.bucket, config.s3.region)
    );
    expect(send).toHaveBeenCalledTimes(2);
    expectAbortState(send, 0, false);
    expectAbortState(send, 1, false);
  });

  it('accepts a create race only when the bucket is confirmed account-owned', async () => {
    const notFound = s3Error('Not Found', 'NotFound', 404);
    const createdByPeer = s3Error('Already owned', 'BucketAlreadyOwnedByYou', 409);
    s3Mock.on(HeadBucketCommand).rejectsOnce(notFound).resolves({});
    s3Mock.on(CreateBucketCommand).rejects(createdByPeer);

    const s3 = new S3Client({});
    const send = vi.spyOn(s3, 'send');
    await expect(ensureBucket(s3)).resolves.toBeUndefined();
    expect(s3Mock.commandCalls(HeadBucketCommand).length).toBe(2);
    expect(send).toHaveBeenCalledTimes(3);
    expectAbortState(send, 0, false);
    expectAbortState(send, 1, false);
    expectAbortState(send, 2, false);
  });

  it('rethrows a failed ownership-race recheck', async () => {
    const notFound = s3Error('Not Found', 'NotFound', 404);
    const createdByPeer = s3Error('Already owned', 'BucketAlreadyOwnedByYou', 409);
    const accessDenied = s3Error('Access Denied', 'AccessDenied', 403);
    s3Mock.on(HeadBucketCommand).rejectsOnce(notFound).rejectsOnce(accessDenied);
    s3Mock.on(CreateBucketCommand).rejects(createdByPeer);

    await expect(ensureBucket(new S3Client({}))).rejects.toThrow('Access Denied');
    expect(s3Mock.commandCalls(HeadBucketCommand)).toHaveLength(2);
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(1);
  });

  it('does not swallow a globally conflicting bucket name', async () => {
    s3Mock.on(HeadBucketCommand).rejects(s3Error('Not Found', 'NotFound', 404));
    s3Mock.on(CreateBucketCommand).rejects(s3Error('Already exists', 'BucketAlreadyExists', 409));

    await expect(ensureBucket(new S3Client({}))).rejects.toThrow('Already exists');
  });

  it('rethrows a non-race create failure', async () => {
    s3Mock.on(HeadBucketCommand).rejects(s3Error('Not Found', 'NotFound', 404));
    s3Mock.on(CreateBucketCommand).rejects(s3Error('S3 unavailable', 'ServiceUnavailable', 503));

    await expect(ensureBucket(new S3Client({}))).rejects.toThrow('S3 unavailable');
  });

  it('rethrows AccessDenied (403) instead of creating bucket (bug #38)', async () => {
    const accessDeniedError = s3Error('Access Denied', 'AccessDenied', 403);
    s3Mock.on(HeadBucketCommand).rejects(accessDeniedError);
    s3Mock.on(CreateBucketCommand).resolves({});

    const s3 = new S3Client({});
    await expect(ensureBucket(s3)).rejects.toThrow('Access Denied');

    // CreateBucket should NOT have been called
    expect(s3Mock.commandCalls(CreateBucketCommand).length).toBe(0);
  });

  it('rethrows network/TLS errors instead of creating bucket', async () => {
    const networkError = new Error('connect ECONNREFUSED');
    s3Mock.on(HeadBucketCommand).rejects(networkError);
    s3Mock.on(CreateBucketCommand).resolves({});

    const s3 = new S3Client({});
    await expect(ensureBucket(s3)).rejects.toThrow('connect ECONNREFUSED');

    expect(s3Mock.commandCalls(CreateBucketCommand).length).toBe(0);
  });

  it('bounds a bucket probe even when the client never settles', async () => {
    s3Mock.on(HeadBucketCommand).callsFake(() => new Promise(() => {}));

    const s3 = new S3Client({});
    const send = vi.spyOn(s3, 'send');
    await expect(ensureBucket(s3, 10)).rejects.toThrow('S3 HeadBucket timed out after 10ms');
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(1);
    expectAbortState(send, 0, true);
  });

  it('bounds bucket creation even when the client never settles', async () => {
    s3Mock.on(HeadBucketCommand).rejects(s3Error('Not Found', 'NotFound', 404));
    s3Mock.on(CreateBucketCommand).callsFake(() => new Promise(() => {}));

    const s3 = new S3Client({});
    const send = vi.spyOn(s3, 'send');
    await expect(ensureBucket(s3, 10)).rejects.toThrow('S3 CreateBucket timed out after 10ms');
    expect(s3Mock.commandCalls(HeadBucketCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
    expectAbortState(send, 0, false);
    expectAbortState(send, 1, true);
  });

  it('bounds the ownership-race recheck when the client never settles', async () => {
    const notFound = s3Error('Not Found', 'NotFound', 404);
    const createdByPeer = s3Error('Already owned', 'BucketAlreadyOwnedByYou', 409);
    s3Mock
      .on(HeadBucketCommand)
      .rejectsOnce(notFound)
      .callsFake(() => new Promise(() => {}));
    s3Mock.on(CreateBucketCommand).rejects(createdByPeer);

    const s3 = new S3Client({});
    const send = vi.spyOn(s3, 'send');
    await expect(ensureBucket(s3, 10)).rejects.toThrow('S3 HeadBucket timed out after 10ms');
    expect(s3Mock.commandCalls(HeadBucketCommand)).toHaveLength(2);
    expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(3);
    expectAbortState(send, 0, false);
    expectAbortState(send, 1, false);
    expectAbortState(send, 2, true);
  });
});

describe('buildCreateBucketInput', () => {
  it('omits LocationConstraint for us-east-1', () => {
    expect(buildCreateBucketInput('resonance-test', 'us-east-1')).toEqual({
      Bucket: 'resonance-test',
    });
  });

  it('sets LocationConstraint for other AWS regions', () => {
    expect(buildCreateBucketInput('resonance-test', 'eu-central-1')).toEqual({
      Bucket: 'resonance-test',
      CreateBucketConfiguration: { LocationConstraint: 'eu-central-1' },
    });
  });
});

describe('isS3NotFoundError', () => {
  it('recognizes missing bucket and object responses', () => {
    expect(isS3NotFoundError({ name: 'NotFound' })).toBe(true);
    expect(isS3NotFoundError({ name: 'NoSuchBucket' })).toBe(true);
    expect(isS3NotFoundError({ name: 'NoSuchKey' })).toBe(true);
    expect(isS3NotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('does not classify access or transport failures as missing objects', () => {
    expect(isS3NotFoundError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(
      false
    );
    expect(isS3NotFoundError(new Error('connect ECONNREFUSED'))).toBe(false);
  });
});
