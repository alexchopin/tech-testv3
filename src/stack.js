import { Mongo } from 'meteor/mongo';

// Shared between client and server. Each document is one cube standing on the
// floor grid: { x, y, color, createdAt }.
//
// The floor is the plane z = -0.5 (see main.html), so "up" is +z. Cubes fall:
// each (x, y) column is a pile resting on the floor, and a cube's height z is
// its position in the pile, in insertion order. So a new cube lands on top of
// its column, and removing a cube makes the ones above it fall down.
export const Cubes = new Mongo.Collection('cubes');

// The red cube stands on the floor at the origin. It is not stored in the
// collection and can't be removed; its column starts one level higher.
export const RED_CUBE = null;
const RED_POSITION = { x: 0, y: 0, z: 0 };

const SORT = { sort: { createdAt: 1, _id: 1 } };

export function randomColor(random = Math.random) {
  const channel = () => Math.floor(random() * 256).toString(16).padStart(2, '0');
  return `#${channel()}${channel()}${channel()}`;
}

const columnKey = ({ x, y }) => `${x},${y}`;

// Turns the ordered documents into what the scene renders: each cube gets its
// height z in its column.
export function layoutCubes(cubes) {
  const heights = new Map([[columnKey(RED_POSITION), 1]]);
  return cubes.map((cube) => {
    const key = columnKey(cube);
    const z = heights.get(key) || 0;
    heights.set(key, z + 1);
    return { ...cube, z };
  });
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

// Camera that keeps every cube in view, from wherever the user rotated it:
// it looks at the center of the cubes and backs up to fit a sphere around them.
export const CAMERA_FOV = 0.785398; // x3dom's default field of view (45°)
const MIN_CAMERA_DISTANCE = 10; // x3dom's default camera distance
const CAMERA_MARGIN = 1; // free space around the cubes, in cubes

export function cameraFor(cubes) {
  const all = [RED_POSITION, ...cubes];
  const min = (axis) => Math.min(...all.map((c) => c[axis])) - 0.5;
  const max = (axis) => Math.max(...all.map((c) => c[axis])) + 0.5;
  const size = (axis) => max(axis) - min(axis);
  const center = {
    x: (min('x') + max('x')) / 2,
    y: (min('y') + max('y')) / 2,
    z: (min('z') + max('z')) / 2,
  };
  const radius = Math.hypot(size('x'), size('y'), size('z')) / 2;
  const distance = Math.max(MIN_CAMERA_DISTANCE, (radius + CAMERA_MARGIN) / Math.tan(CAMERA_FOV / 2));
  return { center, distance };
}

// The cubes in insertion order: layoutCubes() relies on it to pile them up.
export function stackCursor() {
  return Cubes.find({}, SORT);
}

export async function getStack() {
  return stackCursor().fetchAsync();
}

// Left click on a face: drop a new cube on that side. `cube` is the clicked
// cube's position ({ x, y } is enough), `normal` the clicked face's normal.
export async function addCube(cube, normal, random = Math.random) {
  const column = targetColumn(cube, normal);
  if (!column) return null;
  return Cubes.insertAsync({ ...column, color: randomColor(random), createdAt: new Date() });
}

// Right click: remove the cube; the ones above fall. The red cube stays.
export async function removeCube(id) {
  if (id === RED_CUBE) return false;
  await Cubes.removeAsync(id);
  return true;
}

// Escape: back to the red cube alone. Removed one by one: with the insecure
// package, client code may only remove documents by _id, not with {}.
export async function resetCubes() {
  const cubes = await getStack();
  await Promise.all(cubes.map((cube) => Cubes.removeAsync(cube._id)));
}
