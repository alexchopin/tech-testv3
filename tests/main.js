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
    it("finds a line completed in its middle", function () {
      const [a, b, c, d] = line("red", [1, 0, 0]);
      const win = game.findWin([a, b, d, c]); // the third cube is played last
      assert.strictEqual(win && win.cells.length, 4);
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
    it("ends the game on four in a row and marks the line", function () {
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

  describe("playable cells", function () {
    const playable = (docs) => game.gameState(docs).playable.map((c) => [c.x, c.y, c.z]).sort();

    it("offers the top of each pile and the floor cells sharing a side with one", function () {
      assert.deepStrictEqual(playable(moves([0, 0])), [[-1, 0, 0], [0, -1, 0], [0, 0, 2], [0, 1, 0], [1, 0, 0]]);
    });
    it("leaves out cells outside the grid and full columns", function () {
      assert.ok(!playable(moves([1, 0], [2, 0], [3, 0])).some(([x]) => x === 4));
      assert.ok(!playable(moves(...Array(6).fill([0, 0]))).some(([x, y]) => x === 0 && y === 0));
    });
    it("is empty once the game is over", function () {
      assert.deepStrictEqual(playable(moves([1, 0], [0, 0], [2, 0], [0, 0], [3, 3], [0, 0])), []);
    });
  });

  describe("seats", function () {
    const withPlayers = (docs, ...ids) => docs.map((doc, i) => ({ ...doc, playerId: ids[i % ids.length] }));

    it("lets anyone take Yellow, then anyone else take Red", function () {
      assert.ok(game.isTurnOf(game.gameState([]), "a"));
      const one = game.gameState(withPlayers(moves([1, 0]), "a"));
      assert.strictEqual(game.seatOf(one, "a"), "yellow");
      assert.ok(!game.isTurnOf(one, "a")); // can't hold both colors
      assert.ok(game.isTurnOf(one, "b"));
    });
    it("then only the holder of each color plays it", function () {
      const two = game.gameState(withPlayers(moves([1, 0], [2, 0]), "a", "b"));
      assert.ok(game.isTurnOf(two, "a"));
      assert.ok(!game.isTurnOf(two, "b"));
      assert.ok(!game.isTurnOf(two, "c")); // a spectator
    });
    it("in solo mode, lets a player hold both colors unless someone else took one", function () {
      const one = game.gameState(withPlayers(moves([1, 0]), "a"));
      assert.ok(game.isTurnOf(one, "a", true)); // Red is free: "a" plays it too
      const three = game.gameState(withPlayers(moves([1, 0], [2, 0], [3, 0]), "a", "b", "a"));
      assert.ok(!game.isTurnOf(three, "a", true)); // Red belongs to "b"
    });
    it("frees a color when its only move is taken back", function () {
      const docs = withPlayers(moves([1, 0]), "a");
      docs[0].undone = true;
      docs[0].move = 0;
      const state = game.gameState(docs);
      assert.strictEqual(game.seatOf(state, "a"), null);
      assert.ok(game.isTurnOf(state, "b"));
    });
  });

  describe("lines", function () {
    const count = ({ point, coordIndex }) => {
      const segments = coordIndex.split(" -1").filter((s) => s.trim()).length;
      assert.strictEqual(point.split(",").length, 2 * segments);
      return segments;
    };
    it("draws 6+6 inner floor lines and the 12 edges of the grid", function () {
      assert.strictEqual(count(game.GRID_LINES), 6 + 6 + 12);
    });
    it("draws the 12 edges of the last-move outline", function () {
      assert.strictEqual(count(game.OUTLINE_LINES), 12);
    });
  });

  if (Meteor.isServer) {
    describe("moves (against the test database)", function () {
      const board = async () => (await game.getState()).cubes.map((c) => [c.x, c.y, c.z, c.player]);
      // A click on a face, by player "y" (Yellow) or "r" (Red).
      const play = (who, cube, normal) => game.playMove(game.targetColumn(cube, normal), who);

      beforeEach(async function () {
        await game.Cubes.removeAsync({});
      });

      it("alternates players and drops cubes onto the floor or the pile below", async function () {
        await play("y", BASE, UP); // on the red cube
        await play("r", { x: 0, y: 0, z: 1 }, EAST); // side of a cube in the air: falls
        assert.deepStrictEqual(await board(), [
          [0, 0, 0, "red"], [0, 0, 1, "yellow"], [1, 0, 0, "red"],
        ]);
      });

      it("refuses moves under the floor, outside the grid, or out of turn", async function () {
        assert.strictEqual(await play("y", BASE, DOWN), null);
        assert.strictEqual(await play("y", { x: 3, y: 0, z: 0 }, EAST), null);
        assert.ok(await play("y", BASE, UP));
        assert.strictEqual(await play("y", BASE, EAST), null); // Yellow can't play Red
        for (let z = 1, who = "r"; z < 6; z++, who = who === "r" ? "y" : "r") {
          assert.ok(await play(who, { x: 0, y: 0, z }, UP));
        }
        assert.strictEqual(await play("y", { x: 0, y: 0, z: 6 }, UP), null); // column full
        assert.strictEqual((await board()).length, 7);
      });

      it("plays on a floor cell next to a cube, not further away", async function () {
        assert.strictEqual(await game.playMove({ x: 2, y: 0 }, "y"), null); // not next to a cube
        assert.strictEqual(await game.playMove({ x: 1, y: 1 }, "y"), null); // only a corner touches
        assert.ok(await game.playMove({ x: 1, y: 0 }, "y"));
        assert.ok(await game.playMove({ x: 2, y: 0 }, "r"));
        assert.deepStrictEqual(await board(), [
          [0, 0, 0, "red"], [1, 0, 0, "yellow"], [2, 0, 0, "red"],
        ]);
      });

      it("lets the player take back their last move, once per turn", async function () {
        await play("y", BASE, EAST);
        assert.strictEqual(await game.undoMove("r"), false); // not Red's move
        assert.strictEqual(await game.undoMove("y"), true);
        await play("y", BASE, NORTH);
        assert.strictEqual(await game.undoMove("y"), false);
        assert.deepStrictEqual(await board(), [[0, 0, 0, "red"], [0, 1, 0, "yellow"]]);
      });

      it("stops the game once someone wins, until a new game", async function () {
        await play("y", BASE, UP); // (0,0,1)
        await play("r", BASE, EAST); // (1,0,0)
        await play("y", BASE, NORTH); // (0,1,0)
        await play("r", { x: 1, y: 0, z: 0 }, EAST); // (2,0,0)
        await play("y", { x: 0, y: 1, z: 0 }, NORTH); // (0,2,0)
        await play("r", { x: 2, y: 0, z: 0 }, EAST); // (3,0,0): red cube + 3 = four
        assert.strictEqual((await game.getState()).winner, "red");
        assert.strictEqual(await play("y", BASE, { x: -1, y: 0, z: 0 }), null);
        assert.strictEqual(await game.undoMove("r"), false);

        assert.strictEqual(await game.resetGame("spectator"), true); // the game is over
        assert.strictEqual((await game.getState()).turn, "yellow");
        assert.strictEqual((await board()).length, 1);
      });

      it("lets only the players reset a game in progress, unless it was left idle", async function () {
        await play("y", BASE, UP);
        assert.strictEqual(await game.resetGame("spectator"), false);
        const later = Date.now() + game.IDLE_RESET_MS + 1000;
        assert.strictEqual(await game.resetGame("spectator", later), true);
        await play("y", BASE, UP);
        assert.strictEqual(await game.resetGame("y"), true);
      });

      it("lets one player play both colors in solo mode", async function () {
        assert.ok(await Meteor.callAsync("game.play", { x: 1, y: 0 }, "solo", true)); // Yellow
        assert.ok(await Meteor.callAsync("game.play", { x: -1, y: 0 }, "solo", true)); // Red
        assert.strictEqual(await Meteor.callAsync("game.play", { x: 0, y: 1 }, "other", true), null);
        assert.deepStrictEqual((await board()).map((c) => c[3]), ["red", "yellow", "red"]);
      });

      it("keeps one color per player without solo mode", async function () {
        assert.ok(await Meteor.callAsync("game.play", { x: 1, y: 0 }, "solo"));
        assert.strictEqual(await Meteor.callAsync("game.play", { x: -1, y: 0 }, "solo"), null);
      });

      it("orders moves by sequence number, not by time", async function () {
        await play("y", BASE, UP);
        await play("r", BASE, EAST);
        const seqs = (await game.movesCursor().fetchAsync()).map((doc) => doc.seq);
        assert.deepStrictEqual(seqs, [0, 1]);
      });

      it("identifies players by the hash of their secret, so a published id can't play", async function () {
        assert.ok(await Meteor.callAsync("game.play", { x: 1, y: 0 }, "yellow-secret"));
        const [doc] = await game.movesCursor().fetchAsync();
        assert.strictEqual(doc.playerId, game.playerIdOf("yellow-secret"));
        assert.notStrictEqual(doc.playerId, "yellow-secret");
        // Someone who read the published id tries to undo Yellow's move with it.
        assert.strictEqual(await Meteor.callAsync("game.undo", doc.playerId), false);
        assert.strictEqual(await Meteor.callAsync("game.undo", "yellow-secret"), true);
      });

      it("runs simultaneous moves one at a time through the method", async function () {
        // Two quick clicks by Yellow: without the queue both would read the
        // same state and both play.
        const results = await Promise.all([
          Meteor.callAsync("game.play", { x: 1, y: 0 }, "y"),
          Meteor.callAsync("game.play", { x: -1, y: 0 }, "y"),
        ]);
        assert.strictEqual(results.filter(Boolean).length, 1);
        assert.strictEqual((await board()).length, 2);
      });

      it("checks the method arguments", async function () {
        await assert.rejects(Meteor.callAsync("game.play", { x: 0.5, y: 0 }, "y"), /Match/);
        await assert.rejects(Meteor.callAsync("game.play", { x: 1, y: 0 }), /Match/);
      });
    });
  }
});
