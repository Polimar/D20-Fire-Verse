import assert from "node:assert/strict";
import { test } from "node:test";
import { durationToPcTurns } from "../src/local/spell-duration.js";

test("durationToPcTurns uses 6 seconds per PC turn", () => {
  assert.equal(durationToPcTurns("1 minute"), 10);
  assert.equal(durationToPcTurns("Concentration, up to 1 minute"), 10);
  assert.equal(durationToPcTurns("1 round"), 1);
});
