import { Game } from './Game.js';

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
