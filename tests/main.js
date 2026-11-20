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

describe("cube stack", function () {
  // Loaded lazily so the existing tests above don't depend on it.
  let stack;
  before(async function () {
    stack = await import("../src/stack.js");
  });

  describe("randomColor", function () {
    it("returns a #rrggbb color", function () {
      assert.match(stack.randomColor(), /^#[0-9a-f]{6}$/);
      assert.strictEqual(stack.randomColor(() => 0), "#000000");
      assert.strictEqual(stack.randomColor(() => 0.9999), "#ffffff");
    });
  });

  describe("layoutStack", function () {
    it("puts the n-th cube at height n, on top of the red cube", function () {
      const layout = stack.layoutStack([{ _id: "a", color: "#123456" }, { _id: "b" }]);
      assert.deepStrictEqual(layout.map((c) => c.y), [1, 2]);
      assert.strictEqual(layout[0].color, "#123456");
      assert.strictEqual(layout[1].color, "#ffff00"); // old cubes without a color
    });
  });

  describe("cameraFor", function () {
    it("keeps the default camera for a short stack", function () {
      assert.deepStrictEqual(stack.cameraFor(0), { y: 0, z: 10 });
    });
    it("rises to the middle of the stack and backs up so all of it is in view", function () {
      const size = 20;
      const { y, z } = stack.cameraFor(size);
      const top = size + 0.5;
      const bottom = -0.5;
      assert.strictEqual(y, (top + bottom) / 2);
      const halfView = z * Math.tan(stack.CAMERA_FOV / 2);
      assert.ok(y + halfView >= top && y - halfView <= bottom);
    });
  });

  describe("clickAction", function () {
    const cubes = [{ _id: "a" }, { _id: "b" }];

    it("pushes when the red cube is clicked on an empty stack", function () {
      assert.strictEqual(stack.clickAction([], stack.RED_CUBE), "push");
    });
    it("pushes when the top cube is clicked", function () {
      assert.strictEqual(stack.clickAction(cubes, "b"), "push");
    });
    it("removes a cube that is not the top", function () {
      assert.strictEqual(stack.clickAction(cubes, "a"), "remove");
    });
    it("never removes the red base", function () {
      assert.strictEqual(stack.clickAction(cubes, stack.RED_CUBE), "ignore");
    });
  });

  if (Meteor.isServer) {
    describe("handleCubeClick (against the test database)", function () {
      beforeEach(async function () {
        await stack.Cubes.removeAsync({});
      });

      it("stacks on the top, removes lower cubes, and the rest falls down", async function () {
        const ids = async () => (await stack.getStack()).map((c) => c._id);

        assert.strictEqual(await stack.handleCubeClick(stack.RED_CUBE), "push");
        const [first] = await ids();
        assert.strictEqual(await stack.handleCubeClick(first), "push");
        const [, second] = await ids();
        assert.strictEqual(await stack.handleCubeClick(second), "push");
        assert.strictEqual((await ids()).length, 3);

        assert.strictEqual(await stack.handleCubeClick(stack.RED_CUBE), "ignore");
        assert.strictEqual(await stack.handleCubeClick(first), "remove");

        const remaining = await stack.getStack();
        assert.deepStrictEqual(remaining.map((c) => c._id).slice(0, 1), [second]);
        assert.deepStrictEqual(stack.layoutStack(remaining).map((c) => c.y), [1, 2]);
      });
    });
  }
});
