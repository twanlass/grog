// Registry of tutorial vignettes. To add a new vignette, create a module
// in this folder exporting `{ id, title, setup, steps }` and append it here.
import { selectAndMoveVignette } from "./selectAndMove.js";
import { selectAndBuildVignette } from "./selectAndBuild.js";
import { selectAndAttackVignette } from "./selectAndAttack.js";

export const TUTORIAL_VIGNETTES = [
    selectAndMoveVignette,
    selectAndBuildVignette,
    selectAndAttackVignette,
];

export function getVignette(id) {
    return TUTORIAL_VIGNETTES.find(v => v.id === id) || TUTORIAL_VIGNETTES[0];
}
