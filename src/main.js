import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Cubes, RED_CUBE, stackCursor, layoutStack, handleCubeClick, cameraFor } from './stack.js';

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
  // viewpoint directly and re-center the user's rotation on the stack.
  function moveCamera(camera, { y, z }) {
    const viewpoint = camera._x3domNode;
    const viewarea = viewpoint && viewpoint._nameSpace.doc._viewarea;
    if (!viewarea) { // x3dom not started yet: it will read the attributes
      camera.setAttribute('position', `0 ${y} ${z}`);
      camera.setAttribute('centerOfRotation', `0 ${y} 0`);
      return;
    }

    const { SFVec3f, SFMatrix4f } = x3dom.fields;
    const center = new SFVec3f(0, y, 0);
    viewpoint._vf.position = new SFVec3f(0, y, z);
    viewpoint._vf.centerOfRotation = center; // the user now rotates around the stack
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

  // Dragging rotates the view; a drag that ends over a cube must not count as a
  // click on it. Pointer events fire before x3dom's mouse events, so this is
  // up to date when the mouseup handlers below run.
  const DRAG_THRESHOLD = 5; // px
  let pointerDown = null;
  let lastPointerWasDrag = false;
  window.addEventListener('pointerdown', (e) => {
    pointerDown = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('pointerup', (e) => {
    lastPointerWasDrag = !!pointerDown &&
      Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > DRAG_THRESHOLD;
    pointerDown = null;
  }, true);

  // Camera follows the height of the stack, with a short ease-out animation.
  Template.world.onRendered(function () {
    const camera = this.find('#camera');
    let current = null;
    this.cameraFrame = null;

    const place = (position) => moveCamera(camera, position);

    this.autorun(() => {
      const target = cameraFor(Cubes.find().count());
      cancelAnimationFrame(this.cameraFrame);

      if (!current) { // first render: no animation
        current = target;
        place(current);
        return;
      }

      const step = () => {
        current = {
          y: current.y + (target.y - current.y) * 0.15,
          z: current.z + (target.z - current.z) * 0.15,
        };
        const done = Math.abs(target.y - current.y) < 0.01 && Math.abs(target.z - current.z) < 0.01;
        if (done) current = target;
        place(current);
        if (!done) this.cameraFrame = requestAnimationFrame(step);
      };
      this.cameraFrame = requestAnimationFrame(step);
    });
  });

  Template.world.onDestroyed(function () {
    cancelAnimationFrame(this.cameraFrame); // the autorun itself is stopped by Blaze
  });

  Template.world.helpers({
    cubes() {
      return layoutStack(stackCursor().fetch());
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

    // Click on the top of the stack: add a random-colored cube on top.
    // Click on a lower cube: remove it (the cubes above fall down).
    async 'mouseup #red-cube'() {
      if (lastPointerWasDrag) return;
      try {
        await handleCubeClick(RED_CUBE);
      } catch (e) {
        console.error(e);
      }
    },

    async 'mouseup .stack-cube'() {
      if (lastPointerWasDrag) return;
      try {
        await handleCubeClick(this._id); // `this` is the cube rendered by {{#each}}
      } catch (e) {
        console.error(e);
      }
    },

  });

}

if (Meteor.isServer) {
  // Server code
}
