import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outputDir, rowsPath, sourceCommit, runtimeName, release] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+-alpha\.\d+$/.test(release)) {
  throw new Error(`Invalid alpha release identifier: ${release}`);
}
const rows = readFileSync(rowsPath, 'utf8').trim().split('\n').filter(Boolean);
if (rows.length !== 12) throw new Error(`Expected 12 capture rows, found ${rows.length}`);
const runtimeVersion = runtimeName.replace(/^iOS\s+/, '');
if (runtimeVersion === runtimeName) {
  throw new Error(`Expected an iOS Simulator runtime name, found ${runtimeName}`);
}
const hashes = new Set();
const captures = rows.map((row) => {
  const [index, file, persona, screen, title, device, appearance] = row.split('\t');
  const data = readFileSync(join(outputDir, file));
  if (data.length < 10_000 || data.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`${file} is blank, truncated, or not a PNG`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const orientation = device.endsWith('landscape') ? 'landscape' : 'portrait';
  if (orientation === 'portrait' && height <= width) {
    throw new Error(`${file} is not portrait (${width}x${height})`);
  }
  if (orientation === 'landscape' && width <= height) {
    throw new Error(`${file} is not landscape (${width}x${height})`);
  }
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (hashes.has(sha256)) throw new Error(`${file} duplicates another screenshot`);
  hashes.add(sha256);
  const platform = device.startsWith('iPad') ? 'iPadOS' : 'iOS';
  return {
    index: Number(index), file, persona, screen, title, evidenceKind: 'visual-ui-evidence',
    device, os: `${platform} ${runtimeVersion}`, orientation, appearance, textSize: 'medium',
    width, height, sha256, verified: { png: true, orientation: true, unique: true },
  };
});
const manifest = {
  schemaVersion: 2,
  release,
  generatedAt: new Date().toISOString(),
  revalidatedAt: new Date().toISOString(),
  source: {
    commit: sourceCommit,
    dirty: false,
    status: 'captured-clean-commit',
  },
  proofModel: {
    kind: 'visual-ui-evidence',
    description: 'Deterministic debug-only Simulator scenarios. Screenshots do not prove networking or interaction.',
  },
  verification: {
    fixtureValidator: 'passed', apiReadiness: 'passed', iosDebugBuild: 'passed',
    screenshotCount: 12, screenshotSet: 'integrity-verified', humanVisualInspection: 'pending',
    serviceE2E: 'not run by capture harness; a separate passing service gate is required before measured claims are accepted',
    captureLogsPublished: false,
    releaseReady: false,
  },
  captures,
};
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
