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

describe("3D Connect Four", function () {
  // Loaded lazily so the existing tests above don't depend on it.
  let game;
  before(async function () {
    game = await import("../src/game.js");
  });

  const UP = { x: 0, y: 0, z: 1 };
  const DOWN = { x: 0, y: 0, z: -1 };
  const EAST = { x: 1, y: 0, z: 0 };
  const NORTH = { x: 0, y: 1, z: 0 };
  const BASE = { x: 0, y: 0, z: 0 };

  // Documents as stored, in play order, alternating Yellow then Red.
  const moves = (...columns) => columns.map(([x, y], i) => ({
    _id: `m${i}`, x, y, player: i % 2 ? "red" : "yellow",
  }));
  const positions = (cubes) => cubes.map((c) => [c.x, c.y, c.z]);

  describe("layoutCubes", function () {
    it("starts with the red cube and piles each column in play order", function () {
      const cubes = game.layoutCubes(moves([1, 0], [2, 0], [1, 0], [0, 0]));
      assert.deepStrictEqual(positions(cubes), [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1], [0, 0, 1]]);
      assert.strictEqual(cubes[0].player, "red");
    });
    it("leaves out undone moves", function () {
      const docs = moves([1, 0], [1, 0]);
      docs[0].undone = true;
      assert.deepStrictEqual(positions(game.layoutCubes(docs)), [[0, 0, 0], [1, 0, 0]]);
    });
  });

  describe("faceDirection and targetColumn", function () {
    it("snaps x3dom's slightly off-axis normals to the face's axis", function () {
      assert.deepStrictEqual(game.faceDirection({ x: 0.013, y: -0.002, z: 0.9999 }), UP);
      assert.deepStrictEqual(game.faceDirection({ x: 0.057, y: -0.998, z: 0.037 }), { x: 0, y: -1, z: 0 });
    });
    it("plays on top for the top face, next door for a side face, never under", function () {
      assert.deepStrictEqual(game.targetColumn({ x: 2, y: 3 }, UP), { x: 2, y: 3 });
      assert.deepStrictEqual(game.targetColumn({ x: 2, y: 3 }, EAST), { x: 3, y: 3 });
      assert.deepStrictEqual(game.targetColumn({ x: 2, y: 3 }, NORTH), { x: 2, y: 4 });
      assert.strictEqual(game.targetColumn(BASE, DOWN), null);
    });
  });

  describe("findWin", function () {
    const line = (player, d) => [0, 1, 2, 3].map((k) => ({ player, x: k * d[0], y: k * d[1], z: k * d[2] }));

    it("finds four in a row along an axis, a diagonal and a 3D diagonal", function () {
      for (const d of [[1, 0, 0], [0, 0, 1], [1, -1, 0], [1, 1, 1], [-1, 1, 1]]) {
        const win = game.findWin(line("yellow", d));
        assert.strictEqual(win && win.player, "yellow", `direction ${d}`);
      }
    });
    it("needs four of the same player", function () {
      const cubes = line("red", [1, 0, 0]);
      cubes[2].player = "yellow";
      assert.strictEqual(game.findWin(cubes), null);
      assert.strictEqual(game.findWin(line("red", [1, 0, 0]).slice(0, 3)), null);
    });
  });

  describe("gameState", function () {
    it("lets Yellow start, since the red cube is Red's first move", function () {
      assert.strictEqual(game.gameState([]).turn, "yellow");
      assert.strictEqual(game.gameState(moves([1, 0])).turn, "red");
      assert.strictEqual(game.gameState([]).canUndo, false); // the red cube stays
    });
    it("ends the game on four in a row and lights up the line", function () {
      // Red: base + (0,0,1..3) on top of it. Yellow plays elsewhere.
      const state = game.gameState(moves([1, 0], [0, 0], [2, 0], [0, 0], [3, 3], [0, 0]));
      assert.strictEqual(state.winner, "red");
      assert.strictEqual(state.turn, null);
      assert.strictEqual(state.cubes.filter((c) => c.winning).length, 4);
      assert.strictEqual(state.canUndo, false);
    });
    it("allows one undo per turn", function () {
      const docs = moves([1, 0], [2, 0]);
      assert.strictEqual(game.gameState(docs).canUndo, true);
      docs[1].undone = true;
      docs[1].move = 1;
      docs.push({ _id: "replay", x: 3, y: 0, player: "red" }); // Red plays again
      assert.strictEqual(game.gameState(docs).canUndo, false);
      docs.push({ _id: "next", x: 3, y: 0, player: "yellow" }); // next turn
      assert.strictEqual(game.gameState(docs).canUndo, true);
    });
  });

  describe("gridLines", function () {
    it("draws 8+8 floor lines, 4 vertical edges and the top square", function () {
      const { point, coordIndex } = game.gridLines();
      const segments = coordIndex.split(" -1").filter((s) => s.trim()).length;
      assert.strictEqual(segments, 8 + 8 + 4 + 4);
      assert.strictEqual(point.split(",").length, 2 * segments);
    });
  });

  if (Meteor.isServer) {
    describe("playMove, undoMove, resetGame (against the test database)", function () {
      const board = async () => (await game.getState()).cubes.map((c) => [c.x, c.y, c.z, c.player]);

      beforeEach(async function () {
        await game.resetGame();
      });

      it("alternates players and drops cubes onto the floor or the pile below", async function () {
        await game.playMove(BASE, UP); // Yellow on the red cube
        await game.playMove({ x: 0, y: 0, z: 1 }, EAST); // Red, falls to the floor
        assert.deepStrictEqual(await board(), [
          [0, 0, 0, "red"], [0, 0, 1, "yellow"], [1, 0, 0, "red"],
        ]);
      });

      it("refuses moves under the floor or outside the 7x7x7 grid", async function () {
        assert.strictEqual(await game.playMove(BASE, DOWN), null);
        assert.strictEqual(await game.playMove({ x: 3, y: 0, z: 0 }, EAST), null);
        for (let z = 0; z < 6; z++) await game.playMove({ x: 0, y: 0, z }, UP);
        assert.strictEqual(await game.playMove({ x: 0, y: 0, z: 6 }, UP), null); // column full
        assert.strictEqual((await board()).length, 7);
      });

      it("takes back the last move once per turn", async function () {
        await game.playMove(BASE, EAST); // Yellow
        assert.strictEqual(await game.undoMove(), true);
        assert.strictEqual((await game.getState()).turn, "yellow");
        await game.playMove(BASE, NORTH); // Yellow plays again
        assert.strictEqual(await game.undoMove(), false);
        assert.deepStrictEqual(await board(), [[0, 0, 0, "red"], [0, 1, 0, "yellow"]]);
      });

      it("stops the game once someone wins, until a new game", async function () {
        // Red lines up three cubes along x next to the red cube.
        await game.playMove(BASE, UP); // Y (0,0,1)
        await game.playMove(BASE, EAST); // R (1,0,0)
        await game.playMove(BASE, NORTH); // Y (0,1,0)
        await game.playMove({ x: 1, y: 0, z: 0 }, EAST); // R (2,0,0)
        await game.playMove({ x: 0, y: 1, z: 0 }, NORTH); // Y (0,2,0)
        await game.playMove({ x: 2, y: 0, z: 0 }, EAST); // R (3,0,0): red cube + 3 = four
        const state = await game.getState();
        assert.strictEqual(state.winner, "red");
        assert.strictEqual(await game.playMove(BASE, { x: -1, y: 0, z: 0 }), null);
        assert.strictEqual(await game.undoMove(), false);

        await game.resetGame();
        assert.strictEqual((await game.getState()).turn, "yellow");
        assert.strictEqual((await board()).length, 1);
      });
    });
  }
});
