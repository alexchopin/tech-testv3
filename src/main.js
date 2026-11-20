import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Cubes, RED_CUBE, layoutStack, handleCubeClick } from './stack.js';

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
