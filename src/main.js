import { Game } from './Game.js';

const game = new Game();

let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  game.update(dt);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
