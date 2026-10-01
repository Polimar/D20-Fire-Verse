import assert from "node:assert/strict";
import { test } from "node:test";
import { compactRects, emptyGrid, expandRects, parseCellGrid } from "../src/local/map-grid.js";

test("compactRects round-trips through expandRects", () => {
  const g = emptyGrid(8, 6);
  g[1]![1] = true;
  g[1]![2] = true;
  g[2]![1] = true;
  g[2]![2] = true;
  g[4]![5] = true;
  const rects = compactRects(g);
  assert.deepEqual(rects, [
    { x: 1, y: 1, w: 2, h: 2 },
    { x: 5, y: 4, w: 1, h: 1 },
  ]);
  assert.deepEqual(expandRects(8, 6, rects), g);
});

test("parseCellGrid accepts boolean grids and rects", () => {
  const fromBool = parseCellGrid(
    [
      [false, true],
      [true, false],
    ],
    2,
    2,
  );
  assert.deepEqual(fromBool, [
    [false, true],
    [true, false],
  ]);
  const fromRects = parseCellGrid([{ x: 0, y: 1, w: 2, h: 1 }], 2, 2);
  assert.deepEqual(fromRects, [
    [false, false],
    [true, true],
  ]);
});

test("walls win over hazards before compact", () => {
  const walls = parseCellGrid([{ x: 1, y: 1, w: 1, h: 1 }], 3, 3)!;
  const hazards = parseCellGrid([{ x: 1, y: 1, w: 2, h: 1 }], 3, 3)!;
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (walls[y]![x]) hazards[y]![x] = false;
    }
  }
  assert.deepEqual(compactRects(hazards), [{ x: 2, y: 1, w: 1, h: 1 }]);
});
