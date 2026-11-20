import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Template } from 'meteor/templating';

/*
Important notes

1) this Meteor project includes 2 special packages
- insecure: allows the client to write data (meaning that you don't need Meteor methods to write data to the database)
- autopublish: allows the client to access all server data without need of a publication/subscription

2) you only need to look at main.js and main.html files to understand the code.

3) your goal: suggest and implement a game or interactive feature using this base.
   During the interview, we will review your implementation and may ask you to extend or modify it.
*/

// Shared between client and server. Each document is a cube: { x, y, z, createdAt }.
// Stored in MongoDB, so cubes survive page reloads and server restarts.
export const Cubes = new Mongo.Collection('cubes');

// The red cube is 1x1x1 and centered at the origin, so the cube on top of it
// is centered one unit higher.
const ON_TOP_OF_RED_CUBE = { x: 0, y: 1, z: 0 };

if (Meteor.isClient) {

  Template.world.helpers({
    cubes() {
      return Cubes.find({}, { sort: { createdAt: 1 } });
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

    async 'mouseup #red-cube'() {
      try {
        // Only one yellow cube on top of the red cube.
        if (Cubes.findOne(ON_TOP_OF_RED_CUBE)) {
          return;
        }
        await Cubes.insertAsync({ ...ON_TOP_OF_RED_CUBE, createdAt: new Date() });
      } catch (e) {
        console.error(e);
      }
    },

  });

}

if (Meteor.isServer) {
  // Server code
}
