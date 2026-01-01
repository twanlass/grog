---
name: captains-log
description: Generate a changelog entry from staged changes before committing. Run this before `git commit` to include the log entry in your commit.
---

# Captain's Log Generator

Generate structured changelog entries from **staged changes** and prepend them to `captains-log.txt`. Run this BEFORE committing so the log entry is included in your commit.

## Instructions

1. **Check for staged changes** - Run:
   ```bash
   git diff --staged --stat
   ```
   If nothing is staged, inform the user and stop.

2. **Get the commit message** - The user should provide a commit message as an argument. If not provided, ask them for one.

3. **Analyze staged changes** - Run these commands to understand what's being committed:
   ```bash
   git diff --staged --stat
   git diff --staged
   ```
   Review the actual code changes to understand what was done.

4. **Categorize changes** into three sections:
   - **New**: New features, new files, new capabilities
   - **Improved**: Enhancements, refactors, polish, performance improvements
   - **Fixed**: Bug fixes, error corrections

5. **Format the entry** using this template:
   ```
   YYYY-MM-DD | <commit message>
   ------------------------------
   ### New
   - <new feature descriptions>

   ### Improved
   - <improvement descriptions>

   ### Fixed
   - <bug fix descriptions>
   ```

   Only include sections that have items (skip empty sections).

6. **Update captains-log.txt** - Prepend the new entry after the header. The file should maintain this structure:
   ```
   CAPTAIN'S LOG
   =============

   <newest entry>

   <older entries...>
   ```

7. **Stage the log file** - Run:
   ```bash
   git add captains-log.txt
   ```
   This ensures the log entry is included in the upcoming commit.

8. **Inform the user** - Tell them the log entry was added and staged, and they can now run `git commit -m "<their message>"`.

## Usage Examples

- `/captains-log "Add user authentication"` - Generate entry for staged changes with given commit message
- `/captains-log` - Will prompt for a commit message

## Notes

- Keep descriptions concise (one line each)
- Focus on user-facing changes, not implementation details
- Use active voice ("Added X" not "X was added")
- Today's date is used for the entry
- Run this BEFORE `git commit`, not after
