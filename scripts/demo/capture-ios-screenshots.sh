#!/usr/bin/env bash
# Capture a reproducible local Simulator walkthrough and its bounded evidence bundle.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$ROOT_DIR/ios/ResonanceApp"
SERVER_DIR="$ROOT_DIR/server"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/artifacts/e2e-walkthrough}"
DERIVED_DATA_DIR="${DERIVED_DATA_DIR:-$ROOT_DIR/.tmp/derived-data-e2e-walkthrough}"
API_PORT="${RESONANCE_WALKTHROUGH_API_PORT:-4100}"
API_BASE="http://127.0.0.1:$API_PORT"
RELEASE_VERSION="${RESONANCE_WALKTHROUGH_RELEASE:-v0.1.0-alpha.1}"
RUNTIME_ID=""
APP_PATH=""
BUNDLE_ID=""
SERVER_PID=""
STUDENT_UDID=""
TEACHER_UDID=""
STUDENT_CREATED=0
TEACHER_CREATED=0
STUDENT_BOOTED_BY_SCRIPT=0
TEACHER_BOOTED_BY_SCRIPT=0
CAPTURE_ROWS="$OUTPUT_DIR/.capture-rows.tsv"
CAPTURE_SETTLE_SECONDS="${RESONANCE_SCREENSHOT_SETTLE_SECONDS:-8}"
# shellcheck source=scripts/lib/local-process.sh
source "$ROOT_DIR/scripts/lib/local-process.sh"
# shellcheck source=scripts/demo/capture-ios-simulator.sh
source "$ROOT_DIR/scripts/demo/capture-ios-simulator.sh"

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		echo "Missing required command: $1" >&2
		exit 1
	}
}

stop_server() {
	stop_local_process "$SERVER_PID" 20 '' ''
	SERVER_PID=""
}

cleanup() {
	local status=$?
	trap - EXIT INT TERM
	stop_server
	cleanup_capture_simulators \
		"$STUDENT_UDID" "$TEACHER_UDID" \
		"$STUDENT_CREATED" "$TEACHER_CREATED" \
		"$STUDENT_BOOTED_BY_SCRIPT" "$TEACHER_BOOTED_BY_SCRIPT"
	exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for command in xcodebuild xcrun curl npm node docker jq osascript sips; do require_cmd "$command"; done
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=all)" ]]; then
	echo "Screenshot capture requires a clean worktree, including untracked files." >&2
	exit 1
fi
mkdir -p "$OUTPUT_DIR" "$ROOT_DIR/.tmp"
find "$OUTPUT_DIR" -maxdepth 1 -type f \( -name '*.png' -o -name 'manifest.json' -o -name 'WALKTHROUGH.md' -o -name 'VERIFICATION_BLOCKED.md' \) -delete
: >"$CAPTURE_ROWS"

if ! docker info >/dev/null 2>&1; then
	echo "Launching Docker Desktop..."
	if ! open -a Docker >/dev/null 2>&1; then
		DOCKER_DESKTOP='/Applications/Docker.app/Contents/MacOS/Docker Desktop.app/Contents/MacOS/Docker Desktop'
		if [[ -x "$DOCKER_DESKTOP" ]]; then
			"$DOCKER_DESKTOP" >/dev/null 2>&1 &
		else
			echo "Docker Desktop could not be launched." >&2
			exit 1
		fi
	fi
	for _ in {1..60}; do
		docker info >/dev/null 2>&1 && break
		sleep 2
	done
fi
docker info >/dev/null 2>&1 || { echo "Docker Desktop did not become ready." >&2; exit 1; }

echo "[1/7] Validating fixtures and bootstrapping dedicated local services"
DATABASE_URL='postgresql://resonance:resonance@127.0.0.1:5432/resonance' \
	"$ROOT_DIR/scripts/demo/bootstrap-local-demo.sh"
if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
	echo "Refusing to reuse a process already listening at $API_BASE." >&2
	exit 1
fi
(
	# Run outside server/ so dotenv cannot discover server/.env files. Every
	# value used by this loopback-only process is declared below.
	cd "$OUTPUT_DIR"
	export PORT="$API_PORT"
	export HOST='127.0.0.1'
	export DATABASE_URL='postgresql://resonance:resonance@127.0.0.1:5432/resonance'
	export AUTH_MODE='dev'
	export JWT_SECRET='walkthrough-only-loopback-jwt-secret-000000000000'
	export JWT_REFRESH_SECRET='walkthrough-only-loopback-refresh-secret-00000000'
	export DEV_UNIVERSITY_NAME='Mock University Conservatory'
	export DEV_LOGIN_CALLBACK_URL='resonance://auth-callback'
	export S3_ENDPOINT='http://127.0.0.1:9000'
	export S3_REGION='us-east-1'
	export S3_BUCKET='resonance-dev'
	export S3_ACCESS_KEY='minioadmin'
	export S3_SECRET_KEY='minioadmin'
	export S3_FORCE_PATH_STYLE='true'
	export CORS_ORIGINS='http://127.0.0.1'
	exec "$SERVER_DIR/node_modules/.bin/tsx" "$SERVER_DIR/src/index.ts"
) >"$OUTPUT_DIR/api.log" 2>&1 &
SERVER_PID=$!
for _ in {1..60}; do
	curl -fsS "$API_BASE/ready" >/dev/null 2>&1 && break
	sleep 1
done
if ! curl -fsS "$API_BASE/ready" >/dev/null 2>&1; then
	cat "$OUTPUT_DIR/api.log" >&2
	exit 1
fi

echo "[2/7] Creating dedicated student and teacher Simulators"
RUNTIME_ID="$(xcrun simctl list runtimes available -j | jq -r '[.runtimes[] | select(.platform == "iOS" and .isAvailable)] | sort_by(.version) | last.identifier // empty')"
[[ -n "$RUNTIME_ID" ]] || { echo "No available iOS Simulator runtime." >&2; exit 1; }

find_runtime_scoped_device() {
	local name="$1"
	xcrun simctl list devices available -j | jq -r --arg name "$name" --arg runtime "$RUNTIME_ID" '[.devices[$runtime][]? | select(.name == $name)] | first.udid // empty'
}

IPHONE_TYPE="$(resolve_capture_device_type 'iPhone 16')"
IPAD_TYPE="$(resolve_capture_device_type 'iPad Pro 11-inch')"
if [[ -z "$IPHONE_TYPE" ]]; then IPHONE_TYPE="$(resolve_capture_device_type 'iPhone')"; fi
if [[ -z "$IPAD_TYPE" ]]; then IPAD_TYPE="$(resolve_capture_device_type 'iPad')"; fi
[[ -n "$IPHONE_TYPE" && -n "$IPAD_TYPE" ]] || { echo "Required iPhone/iPad device types are unavailable." >&2; exit 1; }
ensure_capture_device 'Resonance Walkthrough Student' "$IPHONE_TYPE" "$RUNTIME_ID" "$(find_runtime_scoped_device 'Resonance Walkthrough Student')" STUDENT_UDID STUDENT_CREATED STUDENT_BOOTED_BY_SCRIPT
ensure_capture_device 'Resonance Walkthrough Teacher' "$IPAD_TYPE" "$RUNTIME_ID" "$(find_runtime_scoped_device 'Resonance Walkthrough Teacher')" TEACHER_UDID TEACHER_CREATED TEACHER_BOOTED_BY_SCRIPT

SIMULATOR_APP="$(xcode-select -p)/Applications/Simulator.app"
open "$SIMULATOR_APP" >/dev/null 2>&1 || true

xcrun simctl ui "$STUDENT_UDID" appearance light
xcrun simctl ui "$STUDENT_UDID" content_size medium
xcrun simctl ui "$TEACHER_UDID" appearance dark
xcrun simctl ui "$TEACHER_UDID" content_size medium

echo "[3/7] Building and installing the debug app"
rm -rf "$DERIVED_DATA_DIR"
xcodebuild -project "$IOS_DIR/ResonanceApp.xcodeproj" -scheme ResonanceApp -configuration Debug \
	-destination "id=$STUDENT_UDID" -derivedDataPath "$DERIVED_DATA_DIR" \
	ENABLE_USER_SCRIPT_SANDBOXING=NO OTHER_SWIFT_FLAGS='-Xfrontend -disable-sandbox' \
	SWIFT_ACTIVE_COMPILATION_CONDITIONS=RESONANCE_SCREENSHOTS \
	build >"$OUTPUT_DIR/xcodebuild.log"
APP_PATH="$(find "$DERIVED_DATA_DIR/Build/Products" -maxdepth 2 -name 'ResonanceApp.app' -print -quit)"
[[ -d "$APP_PATH" ]] || { echo "Built app bundle was not found." >&2; exit 1; }
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist")"
for udid in "$STUDENT_UDID" "$TEACHER_UDID"; do
	xcrun simctl uninstall "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
	xcrun simctl install "$udid" "$APP_PATH"
done

echo "[4/7] Capturing the 12-step walkthrough"
capture_walkthrough_screen 1 student login 'Student sign-in' "$STUDENT_UDID" light 'iPhone portrait' login "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 2 student courses 'Student course selection' "$STUDENT_UDID" light 'iPhone portrait' courses "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 3 student entry-list 'Draft, submitted, and reviewed entries' "$STUDENT_UDID" light 'iPhone portrait' entry-list "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 4 student new-entry 'Prefilled new-entry form' "$STUDENT_UDID" light 'iPhone portrait' new-entry "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 5 student entry-detail 'Draft capture and submission controls' "$STUDENT_UDID" light 'iPhone portrait' entry-detail "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 6 student queue 'Pending and failed sync work' "$STUDENT_UDID" light 'iPhone portrait' queue "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
rotate_capture_teacher_landscape "$SIMULATOR_APP" "$TEACHER_UDID"
capture_walkthrough_screen 7 teacher courses 'Teacher course selection' "$TEACHER_UDID" dark 'iPad landscape' courses "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 8 teacher teacher-review-queue 'Teacher review queue' "$TEACHER_UDID" dark 'iPad landscape' review-queue "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 9 teacher submission-detail 'Submission media and feedback composer' "$TEACHER_UDID" dark 'iPad landscape' submission-detail "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 10 teacher feedback-editor 'Timestamped feedback draft' "$TEACHER_UDID" dark 'iPad landscape' feedback-editor "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 11 teacher feedback-queued 'Feedback queued state' "$TEACHER_UDID" dark 'iPad landscape' feedback-queued "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"
capture_walkthrough_screen 12 student reviewed-feedback 'Reviewed entry feedback and markers' "$STUDENT_UDID" light 'iPhone portrait' reviewed-feedback "$OUTPUT_DIR" "$API_BASE" "$BUNDLE_ID" "$CAPTURE_SETTLE_SECONDS" "$CAPTURE_ROWS"

echo "[5/7] Validating capture set and generating manifest"
RUNTIME_NAME="$(xcrun simctl list runtimes available -j | jq -r --arg id "$RUNTIME_ID" '.runtimes[] | select(.identifier == $id) | .name')"
node "$ROOT_DIR/scripts/demo/generate-screenshot-manifest.mjs" "$OUTPUT_DIR" "$CAPTURE_ROWS" "$SOURCE_COMMIT" "$RUNTIME_NAME" "$RELEASE_VERSION"

echo "[6/7] Writing walkthrough"
node "$ROOT_DIR/scripts/demo/write-screenshot-walkthrough.mjs" "$OUTPUT_DIR"

rm -f "$CAPTURE_ROWS"
echo "[7/7] Walkthrough bundle ready at $OUTPUT_DIR"
