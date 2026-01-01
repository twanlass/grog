---
name: ship-it
description: Stage all changes, generate changelog, document features, commit, and optionally push. Full commit workflow in one command.
---

# Ship It - Full Commit Workflow

Automates the full commit workflow: stage changes, generate changelog, document new features, commit with a generated message, and optionally push.

## Instructions

### 1. Stage all changes
```bash
git add .
```

### 2. Check for changes
```bash
git diff --staged --stat
```
If nothing is staged, inform the user and stop.

### 3. Generate changelog
Run the `/captains-log` skill using the Skill tool. This will:
- Analyze the staged changes
- Generate a structured changelog entry
- Prepend it to `captains-log.txt`
- Stage the log file

### 4. Stage the changelog
```bash
git add captains-log.txt
```

### 5. Document new major features
If the staged changes include a **new major feature** (new system, new game mechanic, new UI component), create documentation for it:

1. Check if a doc already exists in `docs/features/` for this feature
2. If not, create a new markdown file (e.g., `docs/features/minimap.md`)
3. Use this template:
   ```markdown
   # Feature Name

   Brief description of what this feature does.

   ## How It Works
   - Key behavior points
   - User interactions

   ## Key Files
   - `path/to/main/file.js` - Description
   - `path/to/related/file.js` - Description

   ## Usage
   How the player/user interacts with this feature.
   ```
4. Stage the new docs:
   ```bash
   git add docs/features/
   ```

**Skip this step** for minor changes, bug fixes, or tweaks to existing features.

### 6. Generate commit message
Based on the staged changes, generate a simple 1-line commit message that summarizes the changes. Keep it concise (under 72 characters). Use active voice and focus on what was done, not how.

Good examples:
- "Add user authentication"
- "Fix login redirect bug"
- "Update ship combat balance"
- "Add tooltips and fog of war animations"

### 7. Commit the changes
```bash
git commit -m "<generated commit message>"
```
Do NOT add any generated-by footers or co-author lines. Just the simple commit message.

### 8. Ask about pushing
Use the AskUserQuestion tool to ask the user if they want to push:
- Question: "Push to remote?"
- Options: "Yes, push" / "No, I'll push later"

If they choose yes:
```bash
git push
```

### 9. Summary
Tell the user what was committed and whether it was pushed.

## Usage

- `/ship-it` - Run the full workflow

## Notes

- This skill combines git add, captains-log, feature docs, and commit into one workflow
- New major features get documented in `docs/features/` automatically
- The commit message is auto-generated based on changes
- Push is optional and requires user confirmation
