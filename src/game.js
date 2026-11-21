import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check, Match } from 'meteor/check';
import { SHA256 } from 'meteor/sha';

// 3D Connect Four in a 7x7x7 grid.
//
// The floor is the plane z = -0.5 (see main.html), so "up" is +z. Cubes fall:
// each (x, y) column is a pile resting on the floor, and a cube's height z is
// its position in the pile, in play order.
//
// Shared between client and server. Each document is one move:
// { seq, x, y, player, playerId, createdAt }, plus { undone: true, move } once
// taken back. Undone moves are kept so that each turn allows a single undo.
// `seq` orders the moves: unlike createdAt, it can't tie or depend on a
// client's clock.
// Clients can't write to the collection: moves go through the methods below,
// which check the rules on the server.
export const Cubes = new Mongo.Collection('cubes');

// The collection can't be created twice, so a change to this file reloads the
// page instead of being hot-swapped.
if (module.hot) module.hot.decline();

export const PLAYERS = { red: '#e00000', yellow: '#ffd400' };
const OTHER = { red: 'yellow', yellow: 'red' };
export const GRID_SIZE = 7;
const HALF = (GRID_SIZE - 1) / 2; // x and y go from -3 to 3, z from 0 to 6

// The red cube is the starting point: Red's first move, at the center of the
// floor. It is not stored in the collection and can't be undone.
export const RED_CUBE = null;
const BASE = { _id: RED_CUBE, x: 0, y: 0, z: 0, player: 'red' };

const SORT = { sort: { seq: 1 } };

export const inGrid = ({ x, y, z }) =>
  Math.abs(x) <= HALF && Math.abs(y) <= HALF && z >= 0 && z < GRID_SIZE;

const cellKey = ({ x, y, z }) => `${x},${y},${z}`;
const columnKey = ({ x, y }) => `${x},${y}`;
const sameColumn = (a, b) => a.x === b.x && a.y === b.y;

// The cubes on the board, the red base first, each with its height z, and
// the columns that have cubes: { x, y, z } where z is the next free height.
function layout(docs) {
  const columns = new Map([[columnKey(BASE), { x: BASE.x, y: BASE.y, z: 1 }]]);
  const cubes = [BASE];
  for (const doc of docs) {
    if (doc.undone) continue;
    const key = columnKey(doc);
    if (!columns.has(key)) columns.set(key, { x: doc.x, y: doc.y, z: 0 });
    const column = columns.get(key);
    cubes.push({ ...doc, z: column.z++ });
  }
  return { cubes, columns };
}

export const layoutCubes = (docs) => layout(docs).cubes;

// The 13 directions of a line in 3D, one per pair of opposite directions.
const DIRECTIONS = [];
for (let dx = -1; dx <= 1; dx++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      const first = [dx, dy, dz].find((d) => d !== 0);
      if (first === 1) DIRECTIONS.push({ x: dx, y: dy, z: dz });
    }
  }
}

// Four or more cubes of the same player in a row through `cube`, in any
// direction: the cells of that line, or null.
function lineThrough(board, cube) {
  const at = (k, d) => ({ x: cube.x + k * d.x, y: cube.y + k * d.y, z: cube.z + k * d.z });
  for (const d of DIRECTIONS) {
    let lo = 0;
    let hi = 0;
    while (board.get(cellKey(at(lo - 1, d))) === cube.player) lo--;
    while (board.get(cellKey(at(hi + 1, d))) === cube.player) hi++;
    if (hi - lo + 1 >= 4) return Array.from({ length: hi - lo + 1 }, (_, i) => at(lo + i, d));
  }
  return null;
}

// Four in a row: { player, cells }, or null. Replaying the moves, a line can
// only appear through the cube just played, so only the lines through each
// cube are checked, when it is played: 13 directions per cube.
export function findWin(cubes) {
  const board = new Map();
  for (const cube of cubes) {
    board.set(cellKey(cube), cube.player);
    const cells = lineThrough(board, cube);
    if (cells) return { player: cube.player, cells };
  }
  return null;
}

// Where a cube may be played: on top of a column that has cubes, or on the
// floor right next to one (sharing a side, not only a corner), as long as the
// column is inside the grid and not full. Each with the height z it lands at.
const SIDES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

function playableColumns(columns) {
  const playable = new Map();
  for (const { x, y } of columns.values()) {
    for (const [dx, dy] of SIDES) {
      const key = columnKey({ x: x + dx, y: y + dy });
      const cell = { x: x + dx, y: y + dy, z: columns.get(key)?.z || 0 };
      if (inGrid(cell)) playable.set(key, cell);
    }
  }
  return [...playable.values()];
}

// Who holds each color: the player of its first move still on the board. The
// red cube belongs to no one, so Red's seat goes to the first actual red move.
function seatsOf(docs) {
  const seats = {};
  for (const doc of docs) {
    if (!doc.undone && doc.playerId && !seats[doc.player]) seats[doc.player] = doc.playerId;
  }
  return seats;
}

// Everything the UI and the moves need to know, from the documents in play order.
export function gameState(docs) {
  const { cubes, columns } = layout(docs);
  const win = findWin(cubes);
  const full = cubes.length === GRID_SIZE ** 3;
  const over = !!win || full;

  // Red played the base, so Yellow plays when the count is odd.
  const turn = cubes.length % 2 ? 'yellow' : 'red';

  // The last move can be taken back once: not if it replays an undone move.
  const last = cubes.length > 1 ? cubes[cubes.length - 1] : null;
  const move = cubes.length - 2; // index of the last move among the played ones
  const alreadyUndone = docs.some((doc) => doc.undone && doc.move === move);

  const winning = new Set(win ? win.cells.map(cellKey) : []);
  return {
    cubes: win ? cubes.map((cube) => ({ ...cube, winning: winning.has(cellKey(cube)) })) : cubes,
    turn: over ? null : turn,
    winner: win ? win.player : null,
    draw: full && !win,
    canUndo: !over && !!last && !alreadyUndone,
    last,
    move,
    seats: seatsOf(docs),
    playable: over ? [] : playableColumns(columns),
    nextSeq: docs.length ? docs[docs.length - 1].seq + 1 : 0,
    lastActivity: docs.reduce((t, doc) => Math.max(t, +doc.createdAt || 0), 0),
  };
}

// Players are identified by a secret kept in their browser tab. Only its hash
// is stored, as playerId, so the published moves don't reveal it: knowing a
// player's id isn't enough to play as them.
export const playerIdOf = (secret) => SHA256(secret);

// The color a player holds, if any.
export const seatOf = (state, playerId) =>
  Object.keys(state.seats).find((color) => state.seats[color] === playerId) || null;

// Whether it's this player's turn: their color, or a free color while they
// don't hold the other one. In solo mode, a player may hold both colors and
// play alone, as long as no one else took the other one.
export function isTurnOf(state, playerId, solo = false) {
  if (!state.turn || !playerId) return false;
  const seat = state.seats[state.turn];
  return seat ? seat === playerId : solo || state.seats[OTHER[state.turn]] !== playerId;
}

// The side of a cube that was clicked, from the face normal x3dom gives
// (slightly off-axis): the unit vector along its strongest axis.
export function faceDirection({ x, y, z }) {
  const axes = [['x', x], ['y', y], ['z', z]];
  const [axis, value] = axes.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  return { x: 0, y: 0, z: 0, [axis]: Math.sign(value) };
}

// The column a new cube goes to when the given face of a cube is clicked:
// the same column for the top face, the neighbouring one for a side face.
// Nothing for the bottom face: under a cube there is either the floor or
// another cube.
export function targetColumn(cube, normal) {
  const dir = faceDirection(normal);
  if (dir.z < 0) return null;
  return { x: cube.x + dir.x, y: cube.y + dir.y };
}

// The playable cell a column leads to, with its landing height, if any.
export const playableCell = (state, column) =>
  (column && state.playable.find((cell) => sameColumn(cell, column))) || null;

// --- Lines for x3dom IndexedLineSet nodes ---

// The 12 edges of the box from `lo` to `hi` (from `zLo` to `zHi` vertically).
function boxEdges(lo, hi, zLo = lo, zHi = hi) {
  const corners = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];
  return corners.flatMap(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4];
    return [
      [[x, y, zLo], [nx, ny, zLo]], // bottom square
      [[x, y, zHi], [nx, ny, zHi]], // top square
      [[x, y, zLo], [x, y, zHi]], // vertical edge
    ];
  });
}

const toLineSet = (segments) => ({
  point: segments.flat().map((p) => p.join(' ')).join(', '),
  coordIndex: segments.map((_, i) => `${2 * i} ${2 * i + 1} -1`).join(' '),
});

// The 7x7 cells on the floor and the edges of the 7x7x7 volume.
export const GRID_LINES = (() => {
  const lo = -HALF - 0.5;
  const hi = HALF + 0.5;
  const floor = -0.5 + 0.01; // just above the floor plane, to stay visible
  const inner = [];
  for (let t = lo + 1; t < hi; t++) inner.push([[t, lo, floor], [t, hi, floor]], [[lo, t, floor], [hi, t, floor]]);
  return toLineSet([...inner, ...boxEdges(lo, hi, floor, GRID_SIZE - 0.5)]);
})();

// The outline drawn around the last move, centered on the origin.
export const OUTLINE_LINES = toLineSet(boxEdges(-0.53, 0.53));

// --- Moves ---

// All moves, undone ones included, in play order.
export function movesCursor() {
  return Cubes.find({}, SORT);
}

export async function getState() {
  return gameState(await movesCursor().fetchAsync());
}

// The player drops a cube of their color in a column: the one next to the
// clicked face (see targetColumn), or the floor cell that was clicked.
// Returns the new cube's id, or null when the move isn't allowed.
export async function playMove(column, playerId, solo = false) {
  const state = await getState();
  const cell = playableCell(state, column);
  if (!cell || !isTurnOf(state, playerId, solo)) return null;
  return Cubes.insertAsync({
    seq: state.nextSeq, x: cell.x, y: cell.y, player: state.turn, playerId, createdAt: new Date(),
  });
}

// Right click: the player who just played takes their move back, once per turn.
export async function undoMove(playerId) {
  const state = await getState();
  if (!state.canUndo || state.last.playerId !== playerId) return false;
  await Cubes.updateAsync(state.last._id, { $set: { undone: true, move: state.move } });
  return true;
}

// Escape: new game, back to the red cube alone. Allowed to the two players,
// and to anyone once the game is over, while no one holds a color, or when
// no one has played for a while (the players may have left).
export const IDLE_RESET_MS = 2 * 60 * 1000;

export async function resetGame(playerId, now = Date.now()) {
  const state = await getState();
  const open = !state.turn || !Object.keys(state.seats).length || seatOf(state, playerId) ||
    now - state.lastActivity > IDLE_RESET_MS;
  if (!open) return false;
  await Cubes.removeAsync({});
  return true;
}

// Moves are read-then-write: two at once (two quick clicks, two players) could
// both read the same state and both play. On the server they run one at a time.
let queue = Promise.resolve();
function oneAtATime(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

const COLUMN = { x: Match.Integer, y: Match.Integer };

// Each method takes the player's secret and works with its hash.
Meteor.methods({
  'game.play'(column, secret, solo = false) {
    check(column, COLUMN);
    check(secret, String);
    check(solo, Boolean);
    return oneAtATime(() => playMove(column, playerIdOf(secret), solo));
  },
  'game.undo'(secret) {
    check(secret, String);
    return oneAtATime(() => undoMove(playerIdOf(secret)));
  },
  'game.reset'(secret) {
    check(secret, String);
    return oneAtATime(() => resetGame(playerIdOf(secret)));
  },
});
