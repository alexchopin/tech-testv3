import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Cubes, RED_CUBE, layoutStack, handleCubeClick, cameraFor } from './stack.js';

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

  // Camera follows the height of the stack, with a short ease-out animation.
  Template.world.onRendered(function () {
    const camera = this.find('#camera');
    let current = null;
    this.cameraFrame = null;

    const place = ({ y, z }) => camera.setAttribute('position', `0 ${y} ${z}`);

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
      return layoutStack(Cubes.find({}, { sort: { createdAt: 1, _id: 1 } }).fetch());
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
      try {
        await handleCubeClick(RED_CUBE);
      } catch (e) {
        console.error(e);
      }
    },

    async 'mouseup .stack-cube'() {
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
