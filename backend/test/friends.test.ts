import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptFriend,
  createUser,
  friendTagOf,
  listFriends,
  openAuth,
  rejectFriend,
  removeFriend,
  requestFriend,
} from "../src/local/auth.js";
import { partyInvite, rankedAttach, resetRankedForTests } from "../src/local/ranked.js";
import { boot } from "./helpers.js";

boot();
openAuth();

function pair() {
  const stamp = Date.now().toString(36);
  const a = createUser(`fa_${stamp}`.slice(0, 32), "password", "player");
  const b = createUser(`fb_${stamp}`.slice(0, 32), "password", "player");
  return { a, b };
}

test("createUser assigns a unique six-character Friend ID", () => {
  const { a, b } = pair();
  const tagA = friendTagOf(a.id);
  const tagB = friendTagOf(b.id);
  assert.match(tagA, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(tagB, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(tagA, tagB);
});

test("invite without Accept queues as pending incoming on the target, outgoing on the sender", () => {
  const { a, b } = pair();
  requestFriend(a.id, friendTagOf(b.id));
  const fromA = listFriends(a.id);
  const fromB = listFriends(b.id);
  assert.equal(fromA.length, 1);
  assert.equal(fromA[0]!.status, "pending");
  assert.equal(fromA[0]!.incoming, false);
  assert.equal(fromB[0]!.status, "pending");
  assert.equal(fromB[0]!.incoming, true);
  assert.equal(fromB[0]!.id, a.id);
});

test("the sender cannot Accept their own request", () => {
  const { a, b } = pair();
  requestFriend(a.id, b.username);
  assert.throws(() => acceptFriend(a.id, b.id), /FRIEND_NOT_PENDING/);
  assert.equal(listFriends(a.id)[0]!.status, "pending");
});

test("Accept by the recipient makes them friends", () => {
  const { a, b } = pair();
  requestFriend(a.id, friendTagOf(b.id));
  acceptFriend(b.id, a.id);
  assert.equal(listFriends(a.id)[0]!.status, "accepted");
  assert.equal(listFriends(b.id)[0]!.status, "accepted");
  assert.equal(listFriends(a.id)[0]!.incoming, false);
});

test("a reverse request auto-accepts the pending invite", () => {
  const { a, b } = pair();
  requestFriend(a.id, b.username);
  requestFriend(b.id, a.username);
  assert.equal(listFriends(a.id)[0]!.status, "accepted");
  assert.equal(listFriends(b.id)[0]!.status, "accepted");
});

test("reject closes a pending request; remove drops an accepted friend", () => {
  const { a, b } = pair();
  requestFriend(a.id, friendTagOf(b.id));
  rejectFriend(b.id, a.id);
  assert.equal(listFriends(a.id).length, 0);
  requestFriend(a.id, b.username);
  acceptFriend(b.id, a.id);
  removeFriend(a.id, b.id);
  assert.equal(listFriends(b.id).length, 0);
});

test("party invite stays PARTY_NOT_FRIEND while the request is pending", () => {
  resetRankedForTests();
  const { a, b } = pair();
  rankedAttach({ userId: a.id, username: a.username, send: () => undefined });
  rankedAttach({ userId: b.id, username: b.username, send: () => undefined });
  requestFriend(a.id, b.username);
  assert.throws(() => partyInvite(a.id, a.username, b.username), /PARTY_NOT_FRIEND/);
  acceptFriend(b.id, a.id);
  partyInvite(a.id, a.username, b.username);
});
