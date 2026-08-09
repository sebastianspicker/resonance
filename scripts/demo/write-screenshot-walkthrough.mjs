import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const measured = new Map([
  [1, 'Measured E2E coverage target: dev authentication and token exchange. Requires the separate service gate to pass.'],
  [2, 'Measured E2E coverage target: authenticated student and teacher course membership. Requires the separate service gate to pass.'],
  [3, 'Measured E2E coverage target: draft creation, submission, review transition, and reviewed retrieval. Requires the separate service gate to pass.'],
  [5, 'Measured E2E coverage target: artifact creation, object upload, confirmation, and submission. Requires the separate service gate to pass.'],
  [7, 'Measured E2E coverage target: same-course teacher authorization. Requires the separate service gate to pass.'],
  [8, 'Measured E2E coverage target: submitted entries appear in the teacher review queue. Requires the separate service gate to pass.'],
  [9, 'Measured E2E coverage target: teacher receives an authorized download URL and retrieves exact uploaded bytes. Requires the separate service gate to pass.'],
  [10, 'Measured E2E coverage target: feedback comments and timestamped markers are persisted. Requires the separate service gate to pass.'],
  [12, 'Measured E2E coverage target: student retrieves teacher comments, marker time/text, and reviewed state. Requires the separate service gate to pass.'],
]);
const visualOnly = new Map([
  [4, 'Visual only: deterministic form composition; no save interaction is claimed.'],
  [6, 'Visual only: deterministic pending/failed queue and recovery copy.'],
  [11, 'Visual only: deterministic local Feedback queued indicator.'],
]);
const sections = manifest.captures.map((capture) => `## ${capture.index}. ${capture.title}\n\n![${capture.title}](./${capture.file})\n\n${measured.get(capture.index) ?? visualOnly.get(capture.index)}\n`);
const markdown = `# Resonance hybrid E2E walkthrough\n\nThis local evidence bundle deliberately separates measured service behavior from deterministic Simulator UI evidence. Screenshots narrate the workflow; they do not independently prove taps, networking, upload, authorization, or persistence. The process-level E2E is the intended proof source, and its claims are accepted only after that separate gate passes.\n\n${sections.join('\n')}\n## Verification boundary\n\nSee \`manifest.json\` for device/OS/appearance/text-size metadata, dimensions, SHA-256 checksums, source state, and capture validation. Human visual inspection and repository gates are recorded in the final handoff after capture.\n`;
writeFileSync(join(dir, 'WALKTHROUGH.md'), markdown);
