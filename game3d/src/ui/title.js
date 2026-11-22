// The title card, over the live AI skirmish main.js runs behind it. Modes are the 2D game's
// scenarios (scenarios/index.js) minus the two not carried over yet: Multiplayer and the Tutorial.

const MODES = [
  { id: 'versus', name: 'Skirmish', desc: 'Play against AI opponents' },
  { id: 'defend', name: 'Defend', desc: 'Survive waves of enemies' },
  { id: 'sandbox', name: 'Sandbox', desc: 'Casual adventure' },
];

export function showTitle(root, { onStart }) {
  let mode = 'versus';
  let ai = 3;
  let difficulty = 'normal';
  root.innerHTML = `<div class="title">
    <div class="card">
      <h1>Grog<sup>3D</sup></h1>
      <p class="dim">Build ports, raise towers, command ships, plunder your rivals.</p>
      <div class="modes">${MODES.map((m) => `<button data-mode="${m.id}"><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>
      <div class="opts" id="opts">
        <label>Opponents <select id="ai"><option>1</option><option>2</option><option selected>3</option></select></label>
        <label>Difficulty <select id="diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label>
      </div>
      <button class="go" id="go">Set sail</button>
      <p class="dim tiny">The 2D original lives at <a href="https://grog-rts.netlify.app" target="_blank" rel="noopener">grog-rts.netlify.app</a></p>
    </div></div>`;
  const sync = () => {
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    root.querySelector('#opts').style.visibility = mode === 'versus' ? 'visible' : 'hidden';
  };
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; sync(); }));
  root.querySelector('#ai').addEventListener('change', (e) => { ai = Number(e.target.value); });
  root.querySelector('#diff').addEventListener('change', (e) => { difficulty = e.target.value; });
  root.querySelector('#go').addEventListener('click', () => onStart({ scenarioId: mode, aiCount: ai, difficulty }));
  sync();
}
