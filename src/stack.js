import { Mongo } from 'meteor/mongo';

// Shared between client and server. Each document is one cube of the stack
// sitting on the red cube: { color, createdAt }.
// The stack order is the insertion order; a cube's height is derived from its
// position in the stack, so removing a cube makes the ones above it fall down.
export const Cubes = new Mongo.Collection('cubes');

// The red cube is the base of the stack. It is not stored in the collection.
export const RED_CUBE = null;

const DEFAULT_COLOR = '#ffff00'; // cubes created before colors existed
const SORT = { sort: { createdAt: 1, _id: 1 } };

export function randomColor(random = Math.random) {
  const channel = () => Math.floor(random() * 256).toString(16).padStart(2, '0');
  return `#${channel()}${channel()}${channel()}`;
}

// Turns the ordered documents into what the scene renders.
// The red cube is 1x1x1 at the origin, so the n-th cube of the stack is at y = n.
export function layoutStack(cubes) {
  return cubes.map((cube, index) => ({
    ...cube,
    color: cube.color || DEFAULT_COLOR,
    y: index + 1,
  }));
}

// What a click does: 'push' a new cube when the clicked cube is the top of the
// stack, 'remove' it when it is lower in the stack. The red base cannot be
// removed, so clicking it while cubes sit on it does nothing ('ignore').
export function clickAction(stack, clickedId) {
  const topId = stack.length ? stack[stack.length - 1]._id : RED_CUBE;
  if (clickedId === topId) return 'push';
  if (clickedId === RED_CUBE) return 'ignore';
  return 'remove';
}

export async function getStack() {
  return Cubes.find({}, SORT).fetchAsync();
}

export async function handleCubeClick(clickedId, random = Math.random) {
  const action = clickAction(await getStack(), clickedId);
  if (action === 'push') {
    await Cubes.insertAsync({ color: randomColor(random), createdAt: new Date() });
  } else if (action === 'remove') {
    await Cubes.removeAsync(clickedId);
  }
  return action;
}
