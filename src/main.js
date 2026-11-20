import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import {
  RED_CUBE, stackCursor, layoutCubes, cameraFor, addCube, removeCube, resetCubes,
} from './stack.js';

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

  // Moves the camera while keeping the rotation/zoom the user did with the mouse.
  // Setting the viewpoint's "position" attribute would make x3dom forget it
  // (Viewpoint.resetView -> Viewarea.resetNavHelpers), so we update the
  // viewpoint directly and re-center the user's rotation on the cubes.
  function moveCamera(camera, { center: c, distance }) {
    const viewpoint = camera._x3domNode;
    const viewarea = viewpoint && viewpoint._nameSpace.doc._viewarea;
    if (!viewarea) { // x3dom not started yet: it will read the attributes
      camera.setAttribute('position', `${c.x} ${c.y} ${c.z + distance}`);
      camera.setAttribute('centerOfRotation', `${c.x} ${c.y} ${c.z}`);
      return;
    }

    const { SFVec3f, SFMatrix4f } = x3dom.fields;
    const center = new SFVec3f(c.x, c.y, c.z);
    viewpoint._vf.position = new SFVec3f(c.x, c.y, c.z + distance);
    viewpoint._vf.centerOfRotation = center; // the user now rotates around the cubes
    viewpoint._viewMatrix = SFMatrix4f.translation(viewpoint._vf.position)
      .mult(viewpoint._vf.orientation.toMatrix())
      .inverse();

    // Same orientation as the user chose, but orbiting the new center.
    const rotation = viewarea._rotMat.copy();
    rotation.setTranslate(new SFVec3f(0, 0, 0));
    viewarea._rotMat = SFMatrix4f.translation(center)
      .mult(rotation)
      .mult(SFMatrix4f.translation(center.negate()));

    viewpoint._nameSpace.doc.needRender = true;
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

  // Left click on a face: add a cube on that side. Right click: remove it.
  async function onCubeClick(event, cube) {
    if (lastPointer.wasDrag) return;
    try {
      if (lastPointer.button === 2) {
        await removeCube(cube._id);
      } else if (lastPointer.button === 0) {
        await addCube(cube, { x: event.normalX, y: event.normalY, z: event.normalZ });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Escape: back to the red cube alone.
  async function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    try {
      await resetCubes();
    } catch (e) {
      console.error(e);
    }
  }

  // Camera follows the cubes, with a short ease-out animation.
  Template.world.onRendered(function () {
    const camera = this.find('#camera');
    let current = null;
    this.cameraFrame = null;
    window.addEventListener('keydown', onKeyDown);

    const place = ({ x, y, z, distance }) => moveCamera(camera, { center: { x, y, z }, distance });
    const flat = ({ center, distance }) => ({ ...center, distance });
    const KEYS = ['x', 'y', 'z', 'distance'];

    this.autorun(() => {
      const target = flat(cameraFor(layoutCubes(stackCursor().fetch())));
      cancelAnimationFrame(this.cameraFrame);

      if (!current) { // first render: no animation
        current = target;
        place(current);
        return;
      }

      const step = () => {
        current = Object.fromEntries(KEYS.map((k) => [k, current[k] + (target[k] - current[k]) * 0.15]));
        const done = KEYS.every((k) => Math.abs(target[k] - current[k]) < 0.01);
        if (done) current = target;
        place(current);
        if (!done) this.cameraFrame = requestAnimationFrame(step);
      };
      this.cameraFrame = requestAnimationFrame(step);
    });
  });

  Template.world.onDestroyed(function () {
    cancelAnimationFrame(this.cameraFrame); // the autorun itself is stopped by Blaze
    window.removeEventListener('keydown', onKeyDown);
  });

  Template.world.helpers({
    cubes() {
      return layoutCubes(stackCursor().fetch());
    },
  });

  Template.world.events({
    'mouseup #floor'(event) {
      try {
        console.log('mouseup on floor', event);
      } catch (e) {
        console.error(e);
      }
    },

    'mouseup #red-cube'(event) {
      onCubeClick(event, { _id: RED_CUBE, x: 0, y: 0, z: 0 });
    },

    'mouseup .stack-cube'(event) {
      onCubeClick(event, this); // `this` is the cube rendered by {{#each}}
    },

  });

}

if (Meteor.isServer) {
  // Server code
}
