#!/usr/bin/env bash
# Source-only simulator lifecycle helpers for the walkthrough capture script.

resolve_capture_device_type() {
	local prefix="$1"
	xcrun simctl list devicetypes -j | jq -r --arg prefix "$prefix" '[.devicetypes[] | select(.name | startswith($prefix))] | last.identifier // empty'
}

ensure_capture_device() {
	local name="$1" type_id="$2" runtime_id="$3" existing_udid="$4"
	local result_var="$5" created_var="$6" booted_var="$7"
	local udid="$existing_udid" state

	if [[ -z "$udid" ]]; then
		udid="$(xcrun simctl create "$name" "$type_id" "$runtime_id")"
		printf -v "$created_var" '%s' 1
	fi
	state="$(xcrun simctl list devices -j | jq -r --arg udid "$udid" '.devices[][] | select(.udid == $udid) | .state')"
	if [[ "$state" != "Booted" ]]; then
		xcrun simctl boot "$udid"
		printf -v "$booted_var" '%s' 1
	fi
	xcrun simctl bootstatus "$udid" -b
	printf -v "$result_var" '%s' "$udid"
}

capture_walkthrough_screen() {
	local index="$1" persona="$2" screen="$3" title="$4" udid="$5" appearance="$6" device="$7"
	local file_slug="${8:-$screen}" output_dir="$9" api_base="${10}" bundle_id="${11}"
	local settle_seconds="${12}" rows_path="${13}" filename target

	filename="$(printf '%02d' "$index")-${persona}-${file_slug}.png"
	target="$output_dir/$filename"
	echo "  Capturing $filename"
	SIMCTL_CHILD_RESONANCE_SCREENSHOT_MODE=1 \
		SIMCTL_CHILD_RESONANCE_SCREENSHOT_ROLE="$persona" \
		SIMCTL_CHILD_RESONANCE_SCREENSHOT_SCREEN="$screen" \
		SIMCTL_CHILD_RESONANCE_API_BASE="$api_base" \
		SIMCTL_CHILD_RESONANCE_DEMO_UNIVERSITY_NAME='Mock University Conservatory' \
		xcrun simctl launch --terminate-running-process "$udid" "$bundle_id" >/dev/null
	sleep "$settle_seconds"
	xcrun simctl io "$udid" screenshot "$target" >/dev/null
	if [[ "$device" == *" landscape" ]]; then
		local normalized="$target.normalized.png"
		sips --rotate 90 "$target" --out "$normalized" >/dev/null
		mv "$normalized" "$target"
	fi
	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$index" "$filename" "$persona" "$screen" "$title" "$device" "$appearance" >>"$rows_path"
}

rotate_capture_teacher_landscape() {
	local simulator_app="$1" teacher_udid="$2"
	open "$simulator_app" --args -CurrentDeviceUDID "$teacher_udid" >/dev/null 2>&1 || true
	osascript \
		-e 'tell application "Simulator" to activate' \
		-e 'delay 1' \
		-e 'tell application "System Events" to key code 124 using command down'
	sleep 2
}

cleanup_capture_simulators() {
	local student_udid="$1" teacher_udid="$2"
	local student_created="$3" teacher_created="$4"
	local student_booted="$5" teacher_booted="$6"

	if [[ "$student_booted" -eq 1 ]]; then xcrun simctl shutdown "$student_udid" >/dev/null 2>&1 || true; fi
	if [[ "$teacher_booted" -eq 1 ]]; then xcrun simctl shutdown "$teacher_udid" >/dev/null 2>&1 || true; fi
	if [[ "$student_created" -eq 1 ]]; then xcrun simctl delete "$student_udid" >/dev/null 2>&1 || true; fi
	if [[ "$teacher_created" -eq 1 ]]; then xcrun simctl delete "$teacher_udid" >/dev/null 2>&1 || true; fi
}
