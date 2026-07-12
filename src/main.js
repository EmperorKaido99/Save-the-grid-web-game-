import { Models } from './ModelLoader.js';
import { Game } from './Game.js';

async function init() {
  // Load all 3D models before starting the game
  await Models.loadAll();

  const game = new Game();
  window.__game = game; // debug handle

  let lastTime = performance.now();

  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    game.update(dt);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

init();
