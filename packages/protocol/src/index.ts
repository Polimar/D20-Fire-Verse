/** Shared WebSocket contract (local Express today, AWS API GW later). */

export type ClientAction =
  | "CREATE_ROOM"
  | "CREATE_CHARACTER"
  | "ROLL_ABILITIES"
  | "JOIN_ROOM"
  | "REJOIN"
  | "CHOOSE"
  | "CAST_VOTE"
  | "CLOSE_VOTE"
  | "VOLUNTEER_CHECK"
  | "CLAIM_PUZZLE"
  | "RELEASE_PUZZLE"
  | "PUZZLE_HINT"
  | "PUZZLE_DRAFT"
  | "SOLVE_PUZZLE"
  | "WITHDRAW"
  | "BEGIN_COMBAT"
  | "RETRY_COMBAT"
  | "MAP_MOVE"
  | "PROPOSE_MOVE"
  | "PERFORM_ACTION"
  | "AIM_ACTION"
  | "REACT"
  | "SHORT_REST"
  | "LONG_REST"
  | "END_TURN"
  | "REQUEST_SAVE"
  | "RESUME_SAVE"
  | "CREATE_ARENA"
  | "LIST_ARENAS"
  | "JOIN_ARENA"
  | "SET_ARENA_TEAM"
  | "ARENA_READY"
  | "START_ARENA"
  | "ARENA_PICK_HERO"
  | "ARENA_KICK"
  | "VOICE_INTENT"
  | "PING"
  | "CREATE_HERO"
  | "LIST_HEROES"
  | "SELECT_HERO"
  | "LEVEL_UP"
  | "DELETE_HERO"
  | "RENAME_HERO"
  | "RESPEC_HERO"
  | "BUY_STARTER_BUNDLE"
  | "EQUIP"
  | "UNEQUIP"
  | "FORCE_UNEQUIP"
  | "TOGGLE_ATTUNE"
  | "SET_LOADOUT_PRESET"
  | "RANKED_QUEUE"
  | "RANKED_CANCEL"
  | "PARTY_INVITE"
  | "PARTY_ACCEPT"
  | "PARTY_LEAVE"
  | "PARTY_HERO";

export type ServerEvent =
  | "HELLO"
  | "ROOM_STATE"
  | "SEAT"
  | "CHARACTER_CREATED"
  | "ABILITY_ROLLS"
  | "PONG"
  | "ERROR"
  | "SAVE_ACK"
  | "ARENA_LIST"
  | "RANKED_STATUS"
  | "RANKED_MATCH"
  | "PARTY_STATE";

export type ClientMessage = {
  action: ClientAction;
  roomCode?: string;
  displayName?: string;
  characterId?: string;
  choiceId?: string;
  playerId?: string;
  x?: number;
  y?: number;
  mapX?: number;
  mapY?: number;
  abilityId?: string;
  targetId?: string;
  accept?: boolean;
  saveId?: string;
  intent?: string;
  sequence?: string[];
  campaignId?: string;
  format?: string;
  theme?: string;
  mapSize?: string;
  mapId?: string;
  level?: number;
  privacy?: string;
  name?: string;
  teamId?: string;
  monsterId?: string;
  ready?: boolean;
  heroId?: string;
  itemInstanceId?: string;
  itemId?: string;
  receipt?: string;
  payWith?: string;
  classId?: string;
  species?: string;
  background?: string;
  alignment?: string;
  presetId?: string;
  inCombat?: boolean;
  username?: string;
  partyId?: string;
};

export const VOICE_INTENTS = [
  "choose_1",
  "choose_2",
  "choose_3",
  "end_turn",
  "attack_nearest",
  "cast_magic_missile",
  "equip",
  "unequip",
  "switch_loadout",
  "ready",
  "vendor_browse",
  "buy_slot",
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];

const ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: "Sign in before you take a seat.",
  BAD_ZIP: "That file is not a campaign archive.",
  BAD_USERNAME: "Use 2 to 32 letters, numbers, dots, or dashes.",
  BAD_PASSWORD: "Use at least 4 characters for the password.",
  BAD_ROLE: "The role must be player or admin.",
  USERNAME_TAKEN: "That username is already in use.",
  USER_NOT_FOUND: "That account no longer exists.",
  SELF_LOCKOUT: "You cannot remove your own admin access or delete your own account.",
  LAST_ADMIN: "This is the last active admin. Make another admin first.",
  NOTHING_TO_SAVE: "Nothing changed, so nothing was saved.",
  BAD_ACTION: "That bulk action is not available.",
  BAD_NODE_ID: "Node ids use 2 to 60 lowercase letters, numbers, and underscores.",
  BAD_NODE_TYPE: "Pick a node type: story, skill check, encounter, puzzle, or hub.",
  NODE_EXISTS: "A node with that id already exists in this campaign.",
  NODE_NOT_FOUND: "That node is not in this campaign.",
  NODE_IS_START: "This is the start node. Pick another start node first.",
  NODE_IN_USE: "Other nodes still link here. Change those links first.",
  DANGLING_NEXT: "A link points to a node that does not exist.",
  BAD_CHECK: "A skill check needs an ability and a DC.",
  BAD_PUZZLE: "A puzzle needs options and a solution.",
  BAD_TITLE: "The title needs 1 to 80 characters.",
  NOTHING_PUBLISHED: "This campaign has no published version to go back to.",
  BAD_IMAGE: "Use a PNG, JPEG, or WebP image under 8 MB.",
  CONFIRM_MISMATCH: "The confirmation text did not match. Nothing was deleted.",
  CONTENT_INVALID: "This entry fails the schema. Fix it before you enable it.",
  BAD_CONTENT_KIND: "That content kind does not exist.",
  BAD_CONTENT_ID: "Content ids use 2 to 64 lowercase letters, numbers, and underscores.",
  BAD_CONTENT_BODY: "The entry must be a JSON object.",
  NOT_EDITED: "This entry has no admin edit to revert.",
  FRIEND_SELF: "You cannot add yourself as a friend.",
  FRIEND_NOT_PENDING: "There is no friend request to answer.",
  FRIEND_ALREADY: "You are already friends.",
  BAD_FRIEND_TAG: "Enter a Friend ID or a username.",
  BAD_ABILITY_EFFECT: "That ability uses an effect the table does not know.",
  BAD_CAMPAIGN_ID: "The campaign id may use lowercase letters, numbers, and dashes.",
  BAD_START_NODE: "The campaign has no starting scene.",
  BAD_MONSTER: "A fight names a monster that is not in the campaign.",
  NO_CAMPAIGN: "There is no published campaign to open.",
  FORBIDDEN: "That save belongs to another table.",
  ALREADY_SEATED: "This account is already seated at the table.",
  BAD_LOGIN: "That username or password is wrong.",
  BAD_EMAIL: "That email address doesn't look usable.",
  EMAIL_TAKEN: "That email is already registered.",
  MAIL_NOT_CONFIGURED: "The table can't send mail yet. An admin sets Brevo under Manage the table. The sender must be verified there.",
  MAIL_FAILED: "The confirmation mail didn't send. Check the Brevo key and that the sender is verified.",
  UNCONFIRMED: "Confirm the email we sent before you sign in.",
  BAD_CONFIRM: "That confirmation link is no longer valid.",
  AMAZON_NOT_CONFIGURED: "Sign-in with Amazon isn't set up on this table yet. An admin adds the Client ID and secret under Manage the table → Amazon. Use the test account until then.",
  AMAZON_FAILED: "Amazon didn't confirm the sign-in. Try again.",
  AMAZON_CANCELLED: "Sign-in with Amazon was cancelled.",
  BAD_CONSOLE: "Reload the table and sign in again.",
  PHONE_LINKED: "A phone is already linked to this TV.",
  PAIR_EXPIRED: "That code has expired or was already used. Scan the new one on the TV.",
  NOT_PAIRED: "This phone isn't linked to a TV. Scan the code on the TV.",
  NOT_ALLOWED: "Do that on the TV.",
  NO_TABLE: "Open a campaign or an arena on the TV first.",
  NO_SEAT: "Choose your hero on the TV first.",
  CAMPAIGN_NOT_FOUND: "That campaign is not published.",
  ROOM_NOT_FOUND: "That table doesn't exist anymore. Check the room code or start a new one.",
  ROOM_FULL: "This table already seats three heroes.",
  ARENA_FULL: "That arena has no free seats.",
  ARENA_NOT_READY: "Everyone must pick a hero, pick a team, and ready up.",
  ARENA_TEAMS: "Teams must be even before the fight starts.",
  ARENA_BAD_FORMAT: "That arena format is not available.",
  ARENA_BAD_MONSTER: "That creature is not on the arena roster.",
  ARENA_NO_MONSTERS: "No creatures are enabled for the arena yet. An admin turns them on in the portal.",
  ARENA_BAD_THEME: "That arena theme is not available.",
  ARENA_BAD_SIZE: "Pick a small, medium, or large floor.",
  ARENA_NOT_OWNER: "Only the host can start or kick from this arena.",
  ARENA_NO_SWAP: "Hero swaps are only open between rounds.",
  NOT_ARENA: "That action is for an arena table.",
  ARENA_IN_FIGHT: "The arena fight is already under way.",
  BAD_CHARACTER: "That hero isn't available. Pick another one.",
  CHARACTER_TAKEN: "Someone at the table is already playing that hero.",
  CHARACTER_SEATED: "That hero is seated at a table. Reforge or delete waits until that table closes.",
  FORGE_51_REMOVED: "The old forge is gone. Use Hero builder on the title menu.",
  INCOMPLETE: "That legacy hero file is missing a name, class, or owner.",
  NO_OWNER: "That legacy hero has no matching account.",
  IN_COMBAT: "Not now — a fight is under way.",
  BAD_NODE: "The story lost its place. Resume from your last autosave.",
  NO_NODE: "The story lost its place. Resume from your last autosave.",
  ADVENTURE_OVER: "This adventure is over. Start a new table from Home.",
  USE_COMBAT_ACTIONS: "You're in a fight — act from the battle board.",
  COMBAT_OVER: "That fight is already over.",
  COMBAT_ACTIVE: "You can't step back in the middle of a fight.",
  REST_NOT_OFFERED: "Rest when the fight is over — at the next choice on the table.",
  REST_BUDGET: "This tale allows one long rest or two short rests, and that budget is spent.",
  INVALID_CHOICE: "That path is no longer open.",
  NO_CHOICE: "There's no choice with that number.",
  NOT_PUZZLE: "There's no puzzle here right now.",
  NO_MAP_ROOM: "There's no map for this scene.",
  ROOM_HIDDEN: "You haven't explored that room yet.",
  OUTSIDE_ROOM: "You can only walk inside the room you're in.",
  NO_PLAYER: "Join the table with a hero first.",
  NEED_PLAYER: "A fight needs at least one hero at the table.",
  NO_PLAYERS: "Nobody is seated at the table yet.",
  NO_COMBAT: "There's no fight right now.",
  NO_ROLL: "There's no die waiting to be thrown.",
  NOT_YOUR_TURN: "Hold on — it's not your turn yet.",
  UNREACHABLE: "You can't reach that square this turn.",
  BAD_ABILITY: "Your hero can't do that.",
  NO_ACTION: "You've already used your action this turn. Move, use a bonus action, or end your turn.",
  NO_BONUS: "You've already used your bonus action this turn.",
  NO_EFFECT: "That ability does nothing here.",
  NEED_TARGET: "Pick a target first.",
  BAD_TARGET: "That's not a valid target.",
  OUT_OF_RANGE: "Out of range — move closer first.",
  NO_SHOT: "A wall stands between you.",
  ALREADY_USED: "You've already used that this fight.",
  NO_ITEM: "You don't have that item anymore.",
  NO_CHARGES: "That item has no charges left this fight.",
  SILENCED: "Verbal spells can't be cast inside Silence.",
  NOT_ATTACK: "That ability isn't an attack.",
  NO_TARGET: "There's no enemy left to target.",
  NO_ABILITY: "Your hero has no attack ready.",
  NO_MISSILE: "Your hero doesn't know Magic Missile.",
  UNKNOWN_INTENT: "The table didn't understand that command.",
  SAVE_NOT_FOUND: "No save with that id. Check it and try again.",
  MISSING_FIELDS: "Something was missing from that request. Try again.",
  MISSING_DRAFT: "Finish the character before forging it.",
  BAD_JSON: "The table received a garbled message.",
  UNKNOWN_ACTION: "The table doesn't know that action.",
  BAD_ENCOUNTER: "This fight is missing from the campaign.",
  BAD_MAP: "This fight's map is missing from the campaign.",
  NO_BRANCH: "This scene has no way forward. Resume from your autosave.",
  NO_CHECK: "There's no check to roll here.",
  NEED_NAME: "Give your hero a name.",
  BAD_LEVEL: "Heroes start between level 1 and 10.",
  CLASS_LEVEL_CAP: "This class is not playable at that level yet.",
  HEAVY_ARMOR: "Rage cannot start in Heavy armor.",
  RAGING: "You cannot cast spells while raging.",
  BAD_METHOD: "Pick a way to set your ability scores.",
  BAD_RACE_CLASS_BG: "Pick a race, a class and a background.",
  BAD_ABILITIES: "Every ability needs a score.",
  STANDARD_ARRAY_MISMATCH: "Use each standard array value exactly once: 15, 14, 13, 12, 10, 8.",
  POINT_BUY_RANGE: "With point buy, each score must be between 8 and 15.",
  POINT_BUY_COST: "Those scores cost more than 27 points.",
  POINT_BUY_OVER: "Those scores cost more than 27 points.",
  ROLL_MISMATCH: "Use each rolled score exactly once.",
  ROLL_RANGE: "A rolled score must be between 3 and 18.",
  NEED_SERVER_ROLL: "Roll your scores at the table first.",
  NEED_FLEXIBLE_BONUSES: "Pick two abilities for your half-elf bonuses.",
  FLEXIBLE_DUP: "Your two half-elf bonuses must go to different abilities.",
  FLEXIBLE_ON_FIXED: "Those bonuses can't go on Charisma.",
  BAD_FLEXIBLE: "Pick two abilities for your half-elf bonuses.",
  NEED_RACE_SKILLS: "Pick your extra race skills.",
  SKILL_DUP: "You picked the same skill twice.",
  SKILL_OVERLAP_BG: "Your background already gives you that skill. Pick another.",
  BAD_CLASS_SKILL: "That skill isn't on your class list.",
  NEED_FIGHTING_STYLE: "Pick a fighting style.",
  NEED_2_EXPERTISE: "Pick 2 skills for Expertise.",
  BAD_EXPERTISE: "Expertise must be a skill you already have.",
  NEED_DOMAIN: "Pick a divine domain.",
  BAD_CANTRIP: "That cantrip isn't on your class list.",
  BAD_SPELL: "That spell isn't on your class list.",
  NOT_RITUAL: "That spell has no ritual tag.",
  BAD_MASTERY: "Pick two different weapon masteries the hero knows.",
  MASTERY_LOCKED: "A weapon mastery swap waits for a long rest.",
  BAD_HP_ROLL: "Hit point rolls must fit your hit die.",
  CONNECTING: "Still reaching the table… one moment.",
  NEED_VOLUNTEER: "Someone at the table must step up for this check.",
  NOT_VOTABLE: "You can't vote on that beat.",
  NO_VOTE: "There's no open vote at the table.",
  PUZZLE_UNCLAIMED: "Claim the puzzle first — first hands on the mechanism.",
  NOT_PUZZLE_HOLDER: "Only the player holding the puzzle can submit.",
  PUZZLE_HELD: "Someone else already has their hands on the puzzle.",
  HOLDER_USES_HANDS: "You're holding the puzzle — place symbols, don't soft-hint.",
  BAD_SLOT: "That puzzle slot doesn't exist.",
  BAD_OPTION: "That symbol isn't part of this puzzle.",
  DRAFT_TOO_LONG: "Too many symbols in the draft.",
  NOT_CHECK: "There's no skill check open.",
  NO_VOLUNTEER_YET: "Wait for someone to volunteer before you Help.",
  CANNOT_HELP_SELF: "You can't Help your own check.",
  NO_SLOT: "You have no spell slot left for that.",
  NO_REACTION: "There is nothing to react to.",
  REACTION_PENDING: "Someone still has a reaction to answer.",
  NO_SORCERY: "You don't have enough sorcery points.",
  NO_KI: "You don't have enough ki.",
  BONUS_SPELL: "After a bonus-action spell, only a cantrip is left.",
  DYING: "That hero is down — wait for a death save or for someone to help.",
  NO_WITHDRAW: "You can't step back from this scene. Pick a way forward.",
  NAME_DENIED: "That name isn't allowed.",
  CLASS_DISABLED: "That class is turned off. An admin enables it from the content list.",
  SPECIES_DISABLED: "That species is turned off.",
  BACKGROUND_DISABLED: "That background is turned off.",
  ITEM_DISABLED: "That item is turned off.",
  NEED_GOLD: "You don't have enough gold.",
  BAD_GOLD: "That gold amount isn't valid.",
  BAD_RECEIPT: "That payment receipt isn't valid.",
  RECEIPT_USED: "That payment was already claimed.",
  NOT_IN_SHOP: "That item isn't in today's shop.",
  PAST_DAY: "You cannot change a shop day that has already passed.",
  TOO_MANY_SLOTS: "That day has too many shop slots.",
  ITEM_NOT_ENABLED: "That item is not enabled for play.",
  BAD_DAY: "Use a calendar day like 2026-10-15.",
  BAD_PRICE: "That gold price isn't valid.",
  BAD_ECONOMY: "One of the economy numbers is out of range.",
  ALREADY_QUEUED: "You are already searching for a ranked match.",
  QUEUE_CANCELLED: "You left the ranked queue.",
  RANKED_BUSY: "Finish the current ranked fight before you queue again.",
  PARTY_FULL: "That party already has two people.",
  PARTY_NOT_FRIEND: "You can only party with an accepted friend.",
  PARTY_NOT_FOUND: "That party is gone.",
  NOT_PARTY_LEADER: "Only the party leader can queue.",
  BAD_FORMAT: "That ranked format isn't available.",
  BAD_ITEM: "That item can't be bought here.",
  BAD_PARTY: "That party doesn't fit this queue.",
  BAD_SURFACE: "Say whether this is the TV, the web, or the companion.",
  BAD_CONTENT: "That content entry isn't in the catalog.",
  CAMPAIGN_SEALED: "This adventure has already started. The party is closed.",
  SAVE_ARCHIVED: "That save is from an earlier version. You can look at it, not resume it.",
  LEGACY_CHARACTER: "That hero is from an earlier version. You can look at the sheet, not play it.",
  MULTICLASS_LEVEL: "A second class is chosen when you level up.",
  MULTICLASS_PREREQ: "That class needs higher ability scores.",
  REVIEW_OPEN: "Resolve that entry in the content wizard before it can enter play.",
  LEVEL_CHOICE: "Choose the next level-up step before anything else.",
  RESPEC_DISABLED: "Respec is turned off until progression is finished.",
  LEVEL_UP_PENDING: "Finish this hero's level-up before they sit down. Another hero can still play.",
};

/** Player-facing sentence for a server error code. Never shows a raw code. */
export function describeError(code: string | undefined | null): string {
  if (!code) return "Something went wrong at the table. Try again.";
  const bound = code.match(/^ITEM_BOUND_TO_HERO:(.+)$/);
  if (bound) return `That gear belongs to ${bound[1]}. Only they can equip it.`;
  const inUse = code.match(/^ITEM_IN_USE_BY_HERO:(.+)$/);
  if (inUse) return `${inUse[1]} already has that item equipped.`;
  const known = ERROR_TEXT[code] ?? ERROR_TEXT[code.split(":")[0]!];
  if (known) return known;
  const need = code.match(/^NEED_(\d+)_(CLASS_SKILLS|CANTRIPS|SPELLS)$/);
  if (need) {
    const what = need[2] === "CLASS_SKILLS" ? "class skills" : need[2] === "CANTRIPS" ? "cantrips" : "spells";
    return `Pick ${need[1]} ${what}.`;
  }
  return "The table couldn't do that. Try something else.";
}

/** SRD ids to display labels: "half_orc" → "Half-Orc", "lightfoot_halfling" → "Lightfoot Halfling". */
export function srdLabel(id: string | undefined | null): string {
  if (!id) return "";
  const words = id.split(/[_\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return words[0] === "Half" && words.length === 2 ? words.join("-") : words.join(" ");
}

/**
 * Spoken lines inside narration: `[[glowkindle: Drink. Then we talk.]]`.
 * Everything outside the brackets belongs to the narrator. A line never spans a blank line.
 */
const SPOKEN_LINE = /\[\[([a-z][a-z0-9_]*):\s*([\s\S]*?)\s*\]\]/g;

/** Who speaks, as the table shows them. The voice itself is rendered by the server. */
export type CastMember = { name: string; title: string; color: string; pitch: number };

export type ScriptLine = { speaker: string | null; text: string };

/** Narration split into who-says-what, in order. Narrator pieces have `speaker: null`. */
export function scriptLines(text: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  const push = (speaker: string | null, piece: string) => {
    const t = piece.replace(/[ \t]+/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "");
    if (!t.trim()) return;
    const last = out[out.length - 1];
    if (last && last.speaker === speaker) last.text = `${last.text} ${t.trim()}`;
    else out.push({ speaker, text: t.trim() });
  };
  let at = 0;
  for (const m of text.matchAll(SPOKEN_LINE)) {
    push(null, text.slice(at, m.index));
    push(m[1]!, m[2]!);
    at = m.index! + m[0].length;
  }
  push(null, text.slice(at));
  return out;
}

/** Narration as prose: spoken lines become quotations. */
export function plainNarration(text: string | undefined | null): string {
  return (text ?? "").replace(SPOKEN_LINE, (_m, _id: string, line: string) => `“${line}”`);
}

/** Split a narration paragraph into narrator and spoken runs, keeping whitespace for display. */
export function scriptRuns(paragraph: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  let at = 0;
  for (const m of paragraph.matchAll(SPOKEN_LINE)) {
    if (m.index! > at) out.push({ speaker: null, text: paragraph.slice(at, m.index) });
    out.push({ speaker: m[1]!, text: m[2]! });
    at = m.index! + m[0].length;
  }
  if (at < paragraph.length) out.push({ speaker: null, text: paragraph.slice(at) });
  return out;
}

export {
  actionFolderOf,
  folderActionLists,
  inferActionFolder,
  UI_MOVE_ID,
  type ActionFolder,
} from "./action-folder.js";
