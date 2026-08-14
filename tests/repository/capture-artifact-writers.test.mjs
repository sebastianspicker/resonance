import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const manifestWriter = fileURLToPath(
  new URL("../../scripts/demo/generate-screenshot-manifest.mjs", import.meta.url),
);
const walkthroughWriter = fileURLToPath(
  new URL("../../scripts/demo/write-screenshot-walkthrough.mjs", import.meta.url),
);

function writeCapture(directory, index) {
  const teacher = index >= 7 && index <= 11;
  const data = Buffer.alloc(10_000);
  data.write("89504e470d0a1a0a", "hex");
  data.writeUInt32BE(teacher ? 200 : 100, 16);
  data.writeUInt32BE(teacher ? 100 : 200, 20);
  data[data.length - 1] = index;
  const file = `${String(index).padStart(2, "0")}-${teacher ? "teacher" : "student"}.png`;
  writeFileSync(join(directory, file), data);
  return [
    index,
    file,
    teacher ? "teacher" : "student",
    `screen-${index}`,
    `Capture ${index}`,
    teacher ? "iPad landscape" : "iPhone portrait",
    teacher ? "dark" : "light",
  ].join("\t");
}

test("capture artifact writers preserve the twelve-row manifest and walkthrough contract", () => {
  const directory = mkdtempSync(join(tmpdir(), "resonance-capture-writers-"));
  try {
    const rows = Array.from({ length: 12 }, (_, offset) => writeCapture(directory, offset + 1));
    const rowsPath = join(directory, ".capture-rows.tsv");
    writeFileSync(rowsPath, `${rows.join("\n")}\n`);

    execFileSync(
      "node",
      [
        manifestWriter,
        directory,
        rowsPath,
        "0123456789abcdef0123456789abcdef01234567",
        "iOS 26.2",
        "v0.1.0-alpha.1",
      ],
      { stdio: "pipe" },
    );

    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.verification.screenshotCount, 12);
    assert.equal(manifest.captures.length, 12);
    assert.equal(manifest.captures[0].orientation, "portrait");
    assert.equal(manifest.captures[6].orientation, "landscape");
    assert.equal(manifest.captures.at(-1).index, 12);

    execFileSync("node", [walkthroughWriter, directory], { stdio: "pipe" });
    const walkthrough = readFileSync(join(directory, "WALKTHROUGH.md"), "utf8");
    assert.match(walkthrough, /## 1\. Capture 1/);
    assert.match(walkthrough, /## 12\. Capture 12/);
    assert.match(walkthrough, /Screenshots narrate the workflow/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
