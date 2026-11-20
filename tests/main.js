import assert from "assert";

describe("meteor-app", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "meteor-app");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }
});

describe("cubes", function () {
  // Loaded lazily so the existing tests above don't depend on it.
  let stack;
  before(async function () {
    stack = await import("../src/stack.js");
  });

  const UP = { x: 0, y: 0, z: 1 };
  const DOWN = { x: 0, y: 0, z: -1 };
  const EAST = { x: 1, y: 0, z: 0 };
  const NORTH = { x: 0, y: 1, z: 0 };
  const RED = { _id: null, x: 0, y: 0, z: 0 };

  describe("randomColor", function () {
    it("returns a #rrggbb color", function () {
      assert.match(stack.randomColor(), /^#[0-9a-f]{6}$/);
      assert.strictEqual(stack.randomColor(() => 0), "#000000");
      assert.strictEqual(stack.randomColor(() => 0.9999), "#ffffff");
    });
  });

  describe("layoutCubes", function () {
    it("piles each column on the floor, in insertion order", function () {
      const layout = stack.layoutCubes([
        { _id: "a", x: 1, y: 0 },
        { _id: "b", x: 2, y: 0 },
        { _id: "c", x: 1, y: 0 },
      ]);
      assert.deepStrictEqual(layout.map((c) => [c._id, c.z]), [["a", 0], ["b", 0], ["c", 1]]);
    });
    it("piles the origin column on top of the red cube", function () {
      const layout = stack.layoutCubes([{ _id: "a", x: 0, y: 0 }, { _id: "b", x: 0, y: 0 }]);
      assert.deepStrictEqual(layout.map((c) => c.z), [1, 2]);
    });
  });

  describe("faceDirection", function () {
    it("snaps x3dom's slightly off-axis normals to the face's axis", function () {
      assert.deepStrictEqual(stack.faceDirection({ x: 0.013, y: -0.002, z: 0.9999 }), UP);
      assert.deepStrictEqual(stack.faceDirection({ x: 0.057, y: -0.998, z: 0.037 }), { x: 0, y: -1, z: 0 });
    });
  });

  describe("targetColumn", function () {
    it("adds on top of the same column for the top face", function () {
      assert.deepStrictEqual(stack.targetColumn({ x: 2, y: 3 }, UP), { x: 2, y: 3 });
    });
    it("adds in the neighbouring column for a side face", function () {
      assert.deepStrictEqual(stack.targetColumn({ x: 2, y: 3 }, EAST), { x: 3, y: 3 });
      assert.deepStrictEqual(stack.targetColumn({ x: 2, y: 3 }, NORTH), { x: 2, y: 4 });
    });
    it("never adds under a cube, so never under the floor", function () {
      assert.strictEqual(stack.targetColumn({ x: 0, y: 0 }, DOWN), null);
    });
  });

  describe("cameraFor", function () {
    it("keeps the default camera for the red cube alone", function () {
      assert.deepStrictEqual(stack.cameraFor([]), { center: { x: 0, y: 0, z: 0 }, distance: 10 });
    });
    it("centers on the cubes and backs up so all of them are in view", function () {
      const tower = Array.from({ length: 20 }, (_, i) => ({ x: 0, y: 0, z: i + 1 }));
      const { center, distance } = stack.cameraFor([...tower, { x: 3, y: 0, z: 0 }]);
      assert.deepStrictEqual(center, { x: 1.5, y: 0, z: 10 });
      const halfView = distance * Math.tan(stack.CAMERA_FOV / 2);
      assert.ok(halfView >= Math.hypot(2, 10.5)); // farthest corner from the center
    });
  });

  if (Meteor.isServer) {
    describe("addCube, removeCube, resetCubes (against the test database)", function () {
      const positions = async () =>
        stack.layoutCubes(await stack.getStack()).map((c) => [c.x, c.y, c.z]);

      beforeEach(async function () {
        await stack.Cubes.removeAsync({});
      });

      it("drops new cubes on the clicked side, onto the floor or the pile below", async function () {
        await stack.addCube(RED, UP); // on the red cube
        await stack.addCube({ x: 0, y: 0, z: 1 }, EAST); // side of a cube in the air: falls
        await stack.addCube({ x: 1, y: 0, z: 0 }, UP);
        assert.deepStrictEqual(await positions(), [[0, 0, 1], [1, 0, 0], [1, 0, 1]]);
      });

      it("never adds under the floor", async function () {
        assert.strictEqual(await stack.addCube(RED, DOWN), null);
        assert.deepStrictEqual(await positions(), []);
      });

      it("removes a cube and the ones above it fall, but keeps the red cube", async function () {
        const a = await stack.addCube({ x: 1, y: 0 }, UP);
        await stack.addCube({ x: 1, y: 0 }, UP);
        assert.strictEqual(await stack.removeCube(stack.RED_CUBE), false);
        assert.strictEqual(await stack.removeCube(a), true);
        assert.deepStrictEqual(await positions(), [[1, 0, 0]]);
      });

      it("resets to the red cube alone", async function () {
        await stack.addCube(RED, UP);
        await stack.addCube(RED, EAST);
        await stack.resetCubes();
        assert.deepStrictEqual(await positions(), []);
      });
    });
  }
});
