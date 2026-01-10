---
name: update-docs
description: Update or create feature documentation in docs/features/ by analyzing the current codebase implementation.
---

# Update Feature Documentation

Analyze the codebase and update (or create) feature documentation in `docs/features/`.

## Instructions

### 1. Determine the feature to document

The user should provide a feature name as an argument (e.g., `/update-docs fog-of-war`).

If no argument provided, ask the user which feature they want to document. You can suggest features by:
```bash
ls docs/features/
```

### 2. Check if documentation exists

Look for an existing doc file:
- `docs/features/<feature-name>.md`
- Or similar variations (underscores, etc.)

### 3. Analyze the codebase

Search for the relevant implementation files:

1. **Find key files** - Search for files related to the feature:
   - Check `game/src/systems/` for system files
   - Check `game/src/scenes/` for scene integration
   - Check `game/src/sprites/` for sprite/entity definitions
   - Check `game/src/*.js` for core modules

2. **Read the implementations** - Read the key files to understand:
   - Core data structures
   - Key functions and their purposes
   - How the feature integrates with gameScene.js
   - Any state management patterns
   - Constants and configuration values

3. **Check for related UI** - Look in:
   - `game/src/rendering/` for UI components
   - `game/src/scenes/gameScene.js` for inline rendering

### 4. Write/Update the documentation

Use this template structure (matching existing docs):

```markdown
# Feature Name

Brief 1-2 sentence description of what this feature does.

## Behavior
- Key behavior point 1
- Key behavior point 2
- User-facing interactions
- Any important rules or constraints

## Visual Style (if applicable)
- Describe visual appearance
- Colors, sizes, animations

## Files

| File | Purpose |
|------|---------|
| `path/to/file.js` | Brief description |
| `path/to/other.js` | Brief description |

## Key Functions

### filename.js
- `functionName(params)` - What it does
- `otherFunction(params)` - What it does

### gameScene.js Integration Points
- **Initialization**: How/where feature is set up
- **Updates**: How feature updates each frame (if applicable)
- **Rendering**: How/where feature is rendered

## Data Structures (if complex)

```js
// Show key data structure shapes
{
  field: type,
  nested: { ... }
}
```

## Edge Cases / Notes (if any)
- Important gotchas
- Known limitations
```

### 5. Save the documentation

Write the updated documentation to `docs/features/<feature-name>.md`.

### 6. Update CLAUDE.md if new feature

If this is a **new** feature doc (didn't exist before), add it to the feature list in `CLAUDE.md`:

1. Read `CLAUDE.md`
2. Find the `## Feature Documentation` section
3. Add a new line in alphabetical order: `- [Feature Name](docs/features/feature-name.md) - Brief description`

### 7. Report results

Tell the user:
- What was updated/created
- Summary of key changes
- Any areas that might need manual review

## Usage Examples

- `/update-docs fog-of-war` - Update the fog of war documentation
- `/update-docs combat` - Update combat system documentation
- `/update-docs` - Will prompt for which feature to document

## Notes

- Keep descriptions concise and scannable
- Focus on "what" and "how", not "why" (save rationale for code comments)
- Include actual function signatures, not just names
- Match the style of existing docs in `docs/features/`
- Prioritize information useful for future code modifications
