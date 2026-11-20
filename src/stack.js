import { Mongo } from 'meteor/mongo';

// Shared between client and server. Each document is one cube of the stack
// sitting on the red cube: { color, createdAt }.
// The stack order is the insertion order; a cube's height is derived from its
// position in the stack, so removing a cube makes the ones above it fall down.
export const Cubes = new Mongo.Collection('cubes');

// The red cube is the base of the stack. It is not stored in the collection.
export const RED_CUBE = null;

const SORT = { sort: { createdAt: 1, _id: 1 } };

export function randomColor(random = Math.random) {
  const channel = () => Math.floor(random() * 256).toString(16).padStart(2, '0');
  return `#${channel()}${channel()}${channel()}`;
}

// Turns the ordered documents into what the scene renders.
// The red cube is 1x1x1 at the origin, so the n-th cube of the stack is at y = n.
export function layoutStack(cubes) {
  return cubes.map((cube, index) => ({ ...cube, y: index + 1 }));
}

// What a click does: 'push' a new cube when the clicked cube is the top of the
// stack, 'remove' it when it is lower in the stack. The red base is never
// removed: clicking it while cubes sit on it clears the stack ('reset'), back
// to the red cube alone.
export function clickAction(stack, clickedId) {
  const topId = stack.length ? stack[stack.length - 1]._id : RED_CUBE;
  if (clickedId === topId) return 'push';
  if (clickedId === RED_CUBE) return 'reset';
  return 'remove';
}

// Camera that keeps the whole stack in view: it rises to the middle of the
// stack and moves back when the stack gets taller than the view.
export const CAMERA_FOV = 0.785398; // x3dom's default field of view (45°)
const MIN_CAMERA_DISTANCE = 10; // x3dom's default camera distance
const CAMERA_MARGIN = 1; // free space above and below the stack, in cubes

export function cameraFor(stackSize) {
  const height = stackSize + 1; // the stack plus the red cube
  const bottom = -0.5; // the red cube is centered on the origin
  const y = bottom + height / 2;
  const z = Math.max(MIN_CAMERA_DISTANCE, (height / 2 + CAMERA_MARGIN) / Math.tan(CAMERA_FOV / 2));
  return { y, z };
}

// The stack, bottom to top. Used for rendering and for deciding what a click
// does, so both always agree on which cube is the top.
export function stackCursor() {
  return Cubes.find({}, SORT);
}

export async function getStack() {
  return stackCursor().fetchAsync();
}

export async function handleCubeClick(clickedId, random = Math.random) {
  const stack = await getStack();
  const action = clickAction(stack, clickedId);
  if (action === 'push') {
    await Cubes.insertAsync({ color: randomColor(random), createdAt: new Date() });
  } else if (action === 'remove') {
    await Cubes.removeAsync(clickedId);
  } else if (action === 'reset') {
    // Removed one by one: with the insecure package, client code may only
    // remove documents by _id, not with a selector like {}.
    await Promise.all(stack.map((cube) => Cubes.removeAsync(cube._id)));
  }
  return action;
}
