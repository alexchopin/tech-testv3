import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import {
  PLAYERS, GRID_LINES, OUTLINE_LINES, movesCursor, gameState, targetColumn, playableCell,
  isTurnOf, seatOf, playerIdOf,
} from './game.js';

/*
Important notes

1) this Meteor project includes 2 special packages
- insecure: allows the client to write data (meaning that you don't need Meteor methods to write data to the database)
  -> removed since: the game rules run on the server, in the Meteor methods of game.js
- autopublish: allows the client to access all server data without need of a publication/subscription

2) you only need to look at main.js and main.html files to understand the code.

3) your goal: suggest and implement a game or interactive feature using this base.
   During the interview, we will review your implementation and may ask you to extend or modify it.
*/

if (Meteor.isClient) {

  // Each browser tab is one player: two tabs can play against each other.
  // The secret is kept in sessionStorage so a reload keeps the player's color;
  // only its hash (playerId) is visible to the other players.
  const secret = (() => {
    try {
      let value = sessionStorage.getItem('playerSecret');
      if (!value) sessionStorage.setItem('playerSecret', (value = crypto.randomUUID()));
      return value;
    } catch (e) {
      return crypto.randomUUID(); // storage blocked: a new player on each load
    }
  })();
  const playerId = playerIdOf(secret);

  // Solo mode (key S): this tab plays both colors. Remembered for the tab.
  const solo = new ReactiveVar((() => {
    try { return sessionStorage.getItem('solo') === '1'; } catch (e) { return false; }
  })());
  function toggleSolo() {
    solo.set(!solo.get());
    try { sessionStorage.setItem('solo', solo.get() ? '1' : '0'); } catch (e) { /* not kept */ }
  }

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

  // The rules run on the server (see game.js); the client only asks.
  const call = (name, ...args) => Meteor.callAsync(name, ...args).catch((e) => console.error(e));

  // Left click: play in the given column. Right click: undo.
  function onClick(column) {
    if (lastPointer.wasDrag) return;
    if (lastPointer.button === 2) call('game.undo', secret);
    else if (lastPointer.button === 0 && column) call('game.play', column, secret, solo.get());
  }

  // The column under the mouse: a floor cell, or next to a cube's face.
  const floorColumn = (event) => ({ x: Math.round(event.worldX), y: Math.round(event.worldY) });
  const faceColumn = (event, cube) =>
    targetColumn(cube, { x: event.normalX, y: event.normalY, z: event.normalZ });

  // Preset views. Binding a viewpoint moves the camera there; resetView()
  // also drops the rotation/zoom done with the mouse.
  const VIEWS = { 1: 'view-front', 2: 'view-top', 3: 'view-side' };
  function showView(id) {
    document.getElementById(id).setAttribute('set_bind', 'true');
    document.querySelector('x3d').runtime.resetView();
  }

  // Shortcuts, but not browser ones (Cmd/Ctrl+1...) nor a held key.
  function onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') call('game.reset', secret);
    else if (event.key === 's' || event.key === 'S') toggleSolo();
    else if (VIEWS[event.key]) showView(VIEWS[event.key]);
  }

  Template.world.onCreated(function () {
    // The game state is computed once per change of the moves, for all helpers.
    this.state = new ReactiveVar(gameState([]));
    this.autorun(() => this.state.set(gameState(movesCursor().fetch())));
    this.hover = new ReactiveVar(null); // column under the mouse
  });

  Template.world.onRendered(function () {
    window.addEventListener('keydown', onKeyDown);
  });

  Template.world.onDestroyed(function () {
    window.removeEventListener('keydown', onKeyDown);
  });

  const NAMES = { red: 'Rouge', yellow: 'Jaune' };
  const HINT = 'Clic : jouer · Clic droit : annuler (1 fois par tour) · 1/2/3 : vues · S : solo · Échap : nouvelle partie';
  const state = () => Template.instance().state.get();
  const myTurn = () => isTurnOf(state(), playerId, solo.get());

  Template.world.helpers({
    cubes() {
      const { cubes, winner } = state();
      return cubes.map((cube) => ({
        ...cube,
        color: PLAYERS[cube.player],
        fade: winner && !cube.winning ? 0.75 : 0, // the winning line stands out
      }));
    },

    // Empty floor cells where I may play, in my color.
    cells() {
      if (!myTurn()) return [];
      const { playable, turn } = state();
      return playable.filter((cell) => cell.z === 0).map((cell) => ({ ...cell, color: PLAYERS[turn] }));
    },

    // Where my cube would land, under the mouse.
    preview() {
      if (!myTurn()) return null;
      const cell = playableCell(state(), Template.instance().hover.get());
      return cell && { ...cell, color: PLAYERS[state().turn] };
    },

    last() {
      return state().last;
    },

    status() {
      const s = state();
      const mine = seatOf(s, playerId);
      if (s.winner) {
        return { text: `${NAMES[s.winner]} gagne !`, color: PLAYERS[s.winner], hint: 'Échap : nouvelle partie' };
      }
      if (s.draw) return { text: 'Match nul', hint: 'Échap : nouvelle partie' };
      let you = 'Spectateur';
      if (solo.get() && myTurn()) you = 'Mode solo : vous jouez les deux couleurs';
      else if (mine) you = `Vous : ${NAMES[mine]}`;
      else if (myTurn()) you = `Jouez pour prendre ${NAMES[s.turn]}`;
      const waiting = mine && !myTurn() ? ' (adversaire)' : '';
      return { text: `Tour : ${NAMES[s.turn]}${waiting}`, color: PLAYERS[s.turn], hint: `${you} · ${HINT}` };
    },

    grid: () => GRID_LINES,
    outline: () => OUTLINE_LINES,
  });

  // Only update the preview when the column under the mouse changes.
  function setHover(instance, column) {
    const current = instance.hover.get();
    if (column && current && column.x === current.x && column.y === current.y) return;
    if (column || current) instance.hover.set(column);
  }

  Template.world.events({
    'mouseup #floor'(event) {
      onClick(floorColumn(event));
    },
    'mouseup .cube'(event) {
      onClick(faceColumn(event, this)); // `this` is the cube rendered by {{#each}}
    },
    'mousemove #floor'(event, instance) {
      setHover(instance, floorColumn(event));
    },
    'mousemove .cube'(event, instance) {
      setHover(instance, faceColumn(event, this));
    },
    'mouseout #floor, mouseout .cube'(event, instance) {
      setHover(instance, null);
    },
  });

}

if (Meteor.isServer) {
  // Server code
}
