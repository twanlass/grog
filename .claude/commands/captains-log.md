# Captain's Log Generator

Generate structured changelog entries from git commits and prepend them to `captains-log.txt`.

## Instructions

1. **Get commit info** - Run `git log --oneline -n 1` to get the latest commit (or use the number specified: $ARGUMENTS)

2. **Check for duplicates** - Read `captains-log.txt` and check if any of the commit hashes (short form, e.g., `39c36f8`) already appear in the file. Skip any commits that are already documented. If ALL commits are already documented, inform the user and stop.

3. **Get commit details** - For each NEW (undocumented) commit, run:
   ```bash
   git show --stat --format="%H|%s|%ad" --date=short <commit-hash>
   ```

4. **Analyze changes** - Review the files changed and commit message to understand what was done

5. **Categorize changes** into three sections:
   - **New**: New features, new files, new capabilities
   - **Improved**: Enhancements, refactors, polish, performance improvements
   - **Fixed**: Bug fixes, error corrections

6. **Format the entry** using this template:
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

7. **Update captains-log.txt** - Prepend the new entry after the header. The file should maintain this structure:
   ```
   CAPTAIN'S LOG
   =============

   <newest entry>

   <older entries...>
   ```

## Notes

- Keep descriptions concise (one line each)
- Focus on user-facing changes, not implementation details
- Use active voice ("Added X" not "X was added")
- Commits are identified by their short hash (first 7 chars) - if it appears in the log, skip it
- When skipping duplicates, tell the user which commits were skipped
