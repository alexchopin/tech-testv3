import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import {
  PLAYERS, movesCursor, gameState, gridLines, playMove, undoMove, resetGame,
} from './game.js';

/*
Important notes

1) this Meteor project includes 2 special packages
- insecure: allows the client to write data (meaning that you don't need Meteor methods to write data to the database)
- autopublish: allows the client to access all server data without need of a publication/subscription

2) you only need to look at main.js and main.html files to understand the code.

3) your goal: suggest and implement a game or interactive feature using this base.
   During the interview, we will review your implementation and may ask you to extend or modify it.
*/

if (Meteor.isClient) {

  // Dragging rotates (left) or zooms (right) the view; a drag that ends over a
  // cube must not count as a click on it. Pointer events fire before x3dom's
  // mouse events, so this is up to date when the mouseup handlers below run.
  const DRAG_THRESHOLD = 5; // px
  let pointerDown = null;
  let lastPointer = { wasDrag: false, button: 0 };
  window.addEventListener('pointerdown', (e) => {
    pointerDown = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('pointerup', (e) => {
    lastPointer = {
      wasDrag: !!pointerDown &&
        Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > DRAG_THRESHOLD,
      button: e.button, // 0: left, 2: right
    };
    pointerDown = null;
  }, true);

  const run = (action) => action().catch((e) => console.error(e));

  // Left click on a face: play a cube on that side. Right click: undo.
  function onClick(event, cube) {
    if (lastPointer.wasDrag) return;
    if (lastPointer.button === 2) {
      run(undoMove);
    } else if (lastPointer.button === 0 && cube) {
      run(() => playMove(cube, { x: event.normalX, y: event.normalY, z: event.normalZ }));
    }
  }

  // Escape: new game.
  function onKeyDown(event) {
    if (event.key === 'Escape') run(resetGame);
  }

  Template.world.onRendered(function () {
    window.addEventListener('keydown', onKeyDown);
  });

  Template.world.onDestroyed(function () {
    window.removeEventListener('keydown', onKeyDown);
  });

  const NAMES = { red: 'Rouge', yellow: 'Jaune' };
  const HINT = 'Clic : jouer · Clic droit : annuler (1 fois par tour) · Échap : nouvelle partie';

  Template.world.helpers({
    state() {
      const state = gameState(movesCursor().fetch());
      const over = !state.turn;
      return {
        ...state,
        cubes: state.cubes.map((cube) => ({
          ...cube,
          color: PLAYERS[cube.player],
          fade: over && state.winner && !cube.winning ? 0.75 : 0, // the winning line stands out
        })),
      };
    },

    status() {
      const state = gameState(movesCursor().fetch());
      if (state.winner) {
        return { text: `${NAMES[state.winner]} gagne !`, color: PLAYERS[state.winner], hint: 'Échap : nouvelle partie' };
      }
      if (state.draw) return { text: 'Match nul', hint: 'Échap : nouvelle partie' };
      return { text: `Tour : ${NAMES[state.turn]}`, color: PLAYERS[state.turn], hint: HINT };
    },

    grid() {
      return gridLines();
    },
  });

  Template.world.events({
    'mouseup #floor'(event) {
      onClick(event, null); // only a right click (undo) does something here
    },

    'mouseup .cube'(event) {
      onClick(event, this); // `this` is the cube rendered by {{#each}}
    },
  });

}

if (Meteor.isServer) {
  // Server code
}
