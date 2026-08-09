import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const library = fileURLToPath(
  new URL("../../scripts/lib/local-process.sh", import.meta.url),
);

function runLifecycle(script) {
  return spawnSync("bash", ["-c", script, "--", library], {
    encoding: "utf8",
  });
}

test("local-process waits for the configured budget before a KILL fallback", () => {
  const result = runLifecycle(`
    source "$1"
    events=()
    kill() {
      case "$1" in
        -0) events+=(probe); return 0 ;;
        -TERM) events+=(term:"$2"); return 0 ;;
        -KILL) events+=(kill:"$2"); return 0 ;;
      esac
    }
    sleep() { events+=(sleep:"$1"); }
    wait() { events+=(wait:"$1"); return 1; }
    stop_local_process 741 2 "Stopping test server..." "Test server timed out."
    printf '%s\\n' "\${events[@]}"
  `);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, [
    "Stopping test server...",
    "probe",
    "term:741",
    "probe",
    "sleep:1",
    "probe",
    "sleep:1",
    "probe",
    "kill:741",
    "wait:741",
    "",
  ].join("\n"));
  assert.equal(result.stderr, "Test server timed out.\n");
});

test("local-process defaults to the twenty-second shutdown budget without sleeping", () => {
  const result = runLifecycle(`
    source "$1"
    events=()
    kill() {
      case "$1" in
        -0) events+=(probe); return 0 ;;
        -TERM) events+=(term); return 0 ;;
        -KILL) events+=(kill); return 0 ;;
      esac
    }
    sleep() { events+=(sleep); }
    wait() { events+=(wait); return 0; }
    stop_local_process 742
    printf '%s\\n' "\${events[@]}"
  `);

  assert.equal(result.status, 0, result.stderr);
  const events = result.stdout.trim().split("\n");
  assert.equal(events.filter((event) => event === "sleep").length, 20);
  assert.deepEqual(events.slice(-3), ["probe", "kill", "wait"]);
});

test("local-process reaps a process that exits during graceful shutdown", () => {
  const result = runLifecycle(`
    source "$1"
    probes=0
    events=()
    kill() {
      case "$1" in
        -0)
          probes=$((probes + 1))
          events+=(probe)
          [[ "$probes" -eq 1 ]]
          ;;
        -TERM) events+=(term); return 0 ;;
        -KILL) events+=(kill); return 0 ;;
      esac
    }
    sleep() { events+=(sleep); }
    wait() { events+=(wait); return 1; }
    stop_local_process 743 20
    printf '%s\\n' "\${events[@]}"
  `);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), ["probe", "term", "probe", "probe", "wait"]);
});
