// Registry of tutorial vignettes. To add a new vignette, create a module
// in this folder exporting `{ id, title, setup, steps }` and append it here.
import { selectAndAttackVignette } from "./selectAndAttack.js";

export const TUTORIAL_VIGNETTES = [
    selectAndAttackVignette,
];

export function getVignette(id) {
    return TUTORIAL_VIGNETTES.find(v => v.id === id) || TUTORIAL_VIGNETTES[0];
}
