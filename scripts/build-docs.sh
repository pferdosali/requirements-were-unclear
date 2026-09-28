#!/usr/bin/env bash
#
# Build .docx reflections of the Markdown source-of-truth docs.
#
# The Markdown files under docs/ are the SOURCE OF TRUTH. The .docx files in
# docs/generated/ are generated reflections for sharing / Google Docs import.
# Do not hand-edit the .docx files; edit the .md and re-run this script.
#
# Requires: pandoc (a static binary in ~/.local/bin works; no root needed).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PANDOC="${PANDOC:-$(command -v pandoc || echo "$HOME/.local/bin/pandoc")}"
if [ ! -x "$PANDOC" ] && ! command -v "$PANDOC" >/dev/null 2>&1; then
  echo "pandoc not found. Install it (e.g. a static binary to ~/.local/bin) and retry." >&2
  exit 1
fi

OUT="docs/generated"
mkdir -p "$OUT"

echo "Generating .docx from Markdown source..."

# Blueprint — resource-path includes docs/ so the HLD PNG (../DocBridge-High-Level-Design.png) embeds.
"$PANDOC" docs/blueprint/DocBridge-Blueprint.md \
  --resource-path="$ROOT/docs/blueprint:$ROOT/docs:$ROOT" \
  --toc \
  -o "$OUT/DocBridge-Blueprint.docx"
echo "  ✔ $OUT/DocBridge-Blueprint.docx"

# Technical Specification.
"$PANDOC" docs/tech-spec/DocBridge-Technical-Specification.md \
  --toc \
  -o "$OUT/DocBridge-Technical-Specification.docx"
echo "  ✔ $OUT/DocBridge-Technical-Specification.docx"

# ADRs — consolidated into ONE .docx (README index first, then ADRs in order).
ADR_FILES=(docs/adr/README.md)
for f in $(ls docs/adr/ADR-*.md | sort); do ADR_FILES+=("$f"); done
"$PANDOC" "${ADR_FILES[@]}" \
  --toc \
  --metadata title="DocBridge — Architecture Decision Records" \
  -o "$OUT/DocBridge-ADRs.docx"
echo "  ✔ $OUT/DocBridge-ADRs.docx (consolidated)"

echo "Done. .docx reflections are in $OUT/ — do not hand-edit; edit the .md and re-run."
