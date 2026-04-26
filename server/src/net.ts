/**
 * Returns true when the provided IP address is a loopback address.
 * Supports IPv4, IPv6, and IPv4-mapped IPv6 localhost forms.
 */
export function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
