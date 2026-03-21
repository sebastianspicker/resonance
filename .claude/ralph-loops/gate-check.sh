#!/usr/bin/env bash
# Gate check script — run between phases to verify repo health
# Usage: .claude/ralph-loops/gate-check.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Gate Check ==="
echo ""

echo "[1/5] Lint..."
cd server
npm run lint || { echo "FAIL: lint"; exit 1; }
echo "  OK"

echo "[2/5] Format..."
npm run format:check || { echo "FAIL: format"; exit 1; }
echo "  OK"

echo "[3/5] Build..."
npm run build || { echo "FAIL: build"; exit 1; }
echo "  OK"

echo "[4/5] Test..."
npm test || { echo "FAIL: test"; exit 1; }
echo "  OK"

cd "$REPO_ROOT"

echo "[5/5] Secret scan..."
./scripts/secret-scan.sh || { echo "FAIL: secret-scan"; exit 1; }
echo "  OK"

echo ""
echo "=== GATE PASSED ==="
