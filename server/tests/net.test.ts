import { describe, expect, it } from 'vitest';
import { isLoopbackIp } from '../src/net.js';

describe('isLoopbackIp', () => {
  it('returns true for supported localhost variants', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('returns false for undefined and non-loopback addresses', () => {
    expect(isLoopbackIp(undefined)).toBe(false);
    expect(isLoopbackIp('')).toBe(false);
    expect(isLoopbackIp('192.168.1.10')).toBe(false);
    expect(isLoopbackIp('::ffff:192.168.1.10')).toBe(false);
  });
});
