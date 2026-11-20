import { Mongo } from 'meteor/mongo';

// 3D Connect Four in a 7x7x7 grid.
//
// The floor is the plane z = -0.5 (see main.html), so "up" is +z. Cubes fall:
// each (x, y) column is a pile resting on the floor, and a cube's height z is
// its position in the pile, in play order.
//
// Shared between client and server. Each document is one move:
// { x, y, player, createdAt }, plus { undone: true, move } once taken back.
// Undone moves are kept so that each turn allows a single undo.
export const Cubes = new Mongo.Collection('cubes');

export const PLAYERS = { red: '#e00000', yellow: '#ffd400' };
export const GRID_SIZE = 7;
const HALF = (GRID_SIZE - 1) / 2; // x and y go from -3 to 3, z from 0 to 6

// The red cube is the starting point: Red's first move, at the center of the
// floor. It is not stored in the collection and can't be undone.
export const RED_CUBE = null;
const BASE = { _id: RED_CUBE, x: 0, y: 0, z: 0, player: 'red' };

const SORT = { sort: { createdAt: 1, _id: 1 } };

export const inGrid = ({ x, y, z }) =>
  Math.abs(x) <= HALF && Math.abs(y) <= HALF && z >= 0 && z < GRID_SIZE;

const cellKey = ({ x, y, z }) => `${x},${y},${z}`;
const columnKey = ({ x, y }) => `${x},${y}`;

// The cubes on the board, the red base first, each with its height z.
export function layoutCubes(docs) {
  const heights = new Map([[columnKey(BASE), 1]]);
  const played = docs.filter((doc) => !doc.undone).map((doc) => {
    const key = columnKey(doc);
    const z = heights.get(key) || 0;
    heights.set(key, z + 1);
    return { ...doc, z };
  });
  return [BASE, ...played];
}

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

// Four cubes of the same player in a row, in any direction: { player, cells }.
export function findWin(cubes) {
  const board = new Map(cubes.map((cube) => [cellKey(cube), cube.player]));
  for (const cube of cubes) {
    for (const d of DIRECTIONS) {
      const cells = [0, 1, 2, 3].map((k) => ({ x: cube.x + k * d.x, y: cube.y + k * d.y, z: cube.z + k * d.z }));
      if (cells.every((cell) => board.get(cellKey(cell)) === cube.player)) {
        return { player: cube.player, cells };
      }
    }
  }
  return null;
}

// Everything the UI and the moves need to know, from the documents in play order.
export function gameState(docs) {
  const cubes = layoutCubes(docs);
  const win = findWin(cubes);
  const full = cubes.length === GRID_SIZE ** 3;
  const over = !!win || full;

  // Red played the base, so Yellow plays when the count is odd.
  const turn = cubes.length % 2 ? 'yellow' : 'red';

  // The last move can be taken back once: not if it replays an undone move.
  const last = cubes.length > 1 ? cubes[cubes.length - 1] : null;
  const move = cubes.length - 2; // index of the last move among the played ones
  const alreadyUndone = docs.some((doc) => doc.undone && doc.move === move);
  const canUndo = !over && !!last && !alreadyUndone;

  const winning = new Set(win ? win.cells.map(cellKey) : []);
  return {
    cubes: cubes.map((cube) => ({ ...cube, winning: winning.has(cellKey(cube)) })),
    turn: over ? null : turn,
    winner: win ? win.player : null,
    draw: full && !win,
    canUndo,
    last,
    move,
  };
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

// Lines drawing the edges of the grid and its 7x7 cells on the floor,
// as x3dom IndexedLineSet attributes.
export function gridLines() {
  const lo = -HALF - 0.5;
  const hi = HALF + 0.5;
  const floor = -0.5 + 0.01; // just above the floor plane, to stay visible
  const top = GRID_SIZE - 0.5;
  const segments = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    const t = lo + i;
    segments.push([[t, lo, floor], [t, hi, floor]], [[lo, t, floor], [hi, t, floor]]);
  }
  for (const [x, y] of [[lo, lo], [lo, hi], [hi, lo], [hi, hi]]) {
    segments.push([[x, y, floor], [x, y, top]]);
  }
  segments.push([[lo, lo, top], [hi, lo, top]], [[hi, lo, top], [hi, hi, top]],
    [[hi, hi, top], [lo, hi, top]], [[lo, hi, top], [lo, lo, top]]);
  return {
    point: segments.flat().map((p) => p.join(' ')).join(', '),
    coordIndex: segments.map((_, i) => `${2 * i} ${2 * i + 1} -1`).join(' '),
  };
}

// All moves, undone ones included, in play order.
export function movesCursor() {
  return Cubes.find({}, SORT);
}

export async function getState() {
  return gameState(await movesCursor().fetchAsync());
}

// Left click on a face: the current player drops a cube on that side.
// `cube` is the clicked cube's position, `normal` the clicked face's normal.
// Returns the new cube's id, or null when the move isn't allowed.
export async function playMove(cube, normal) {
  const state = await getState();
  const column = targetColumn(cube, normal);
  if (!state.turn || !column) return null;
  const z = state.cubes.filter((c) => c.x === column.x && c.y === column.y).length;
  if (!inGrid({ ...column, z })) return null;
  return Cubes.insertAsync({ ...column, player: state.turn, createdAt: new Date() });
}

// Right click: take back the last move, once per turn.
export async function undoMove() {
  const state = await getState();
  if (!state.canUndo) return false;
  await Cubes.updateAsync(state.last._id, { $set: { undone: true, move: state.move } });
  return true;
}

// Escape: new game, back to the red cube alone. Removed one by one: with the
// insecure package, client code may only remove documents by _id, not with {}.
export async function resetGame() {
  const docs = await movesCursor().fetchAsync();
  await Promise.all(docs.map((doc) => Cubes.removeAsync(doc._id)));
}
