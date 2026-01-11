#!/bin/bash
# Session start hook - outputs context instructions for Claude

cat << 'EOF'
<session-context>
Before making any implementation plans or significant code changes in this project:

1. Read the adding features guide: docs/features/_adding-features.md
2. Search docs/features/ for any existing documentation related to the feature you're working on
3. Read any relevant feature docs to understand existing patterns and data structures

This ensures consistency with established patterns and prevents duplicate work.
</session-context>
EOF
