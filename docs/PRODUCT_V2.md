# D20 FireVerse — finished product V2

V2 is the L1–L20 table: an account, many heroes, an account stash, SRD 5.2.1 content, and server-owned dice, XP, and gold. It is being written on `main` before the 2026-10-23 hackathon video. The video and the V1 saves share that branch.

## Rules that do not move

- English UI. No guest play. V1 accounts stay. Forged V1 characters and in-progress saves become legacy: readable, not playable, and not resumed.
- Level 1 is one class. A second class is a level-up, and only if the ability prerequisites are met.
- The stash is shared. An equipped item shows "In use" until it is unequipped. Attunement is instant outside combat, three slots per hero.
- Rarity: common 1, uncommon 3, rare 7, very rare 11, legendary 17. A normal drop stays inside that gate. Ranked's 5% is one step higher, stored, and refused until the level matches.
- Gold can be bought. That is pay-to-win and is said in the shop. Experience is never sold.
- The TV and the browser cannot both hold the account. The companion can.
- Procedural PvE uses the danger threshold (sum of levels, divided by 4 when everyone is level 1–4, otherwise by 2) plus 10%. Story fights and PvP do not. A test level is accepted only in test mode.
- Ranked Elo is one number per account. A party uses the average Elo and the highest hero's level. A ranked player who is gone for 45 seconds takes a loss. Arcade, story, and test still Dodge.
- A campaign party is fixed when they leave the first scene. The level cap is that starting size and does not change if someone drops. A second run of the same campaign hero grants no XP.
- Seasons last 60 days. Elo soft-resets with `round(rating * 0.6 + 1000 * 0.4)`. Heroes, XP, stash, and cosmetics stay.

## Phases

1. **Content.** Zod schemas in `packages/content-schema` (tools and backend only). `npm run content:validate` prints problems and does not fail the merge. `npm run content:parse` reads the downfallx monster markdown with 10 strategies and writes `content/srd-5.2.1`. The admin Content tab enables one entry at a time. Invalid entries never enter a fight.
2. **Heroes.** `heroes`, `account_stash`, `hero_milestones`, `account_wallet`. A short denylist in `content/names/denylist.txt`. Deleting a hero returns items and drops that hero's XP. Admins can grant gold before and after the shop has prices. The Hero Starter Bundle is a paid receipt in this phase.
3. **Loadout.** `packages/rules` recomputes AC and bonuses, checks `requires` (species and alignment included), and applies weapon mastery on the attack.
4. **Magic and rarity.** Item effects add AC, attack, damage, and granted spells. Mastery is not reimplemented here.
5. **Rewards.** XP and loot after the encounter. The level number moves only then, with defaults if the player did not choose. One global vendor per UTC day. Prices: 100 / 500 / 3000 / 20000 / 100000.
6. **Queues.** Ranked, arcade, test. Solo, duo, and full team across accounts. Leaderboard stores the winning loadout.
7. **Story.** Campaign heroes and the level-cap matrix on the Luppolandia manifest. The level-up form is on the TV bundle and the phone armory.
8. **Voice, shop, charts.** Companion hears equip, unequip, switch loadout, ready, vendor, and buy. IAP gold bundles are declared pay-to-win. The Stats tab reads the `events` table.

## Checks

`npm run typecheck && NARRATION=off npm test && npm run build`

`content:validate` is not part of that gate.

## Left open on purpose

Content hotfix after launch, SQLite backup, CI/CD, a wider admin, a real profanity filter, the privacy policy for payments and voice, final IAP prices, the public class roadmap, and how many procedural monsters to add beyond the SRD base.

## Hackathon

The October video is recorded from this same `main` line. V1 play still uses the oneshot pregens. V2 content stays off until an admin enables it, so an empty catalog cannot crash a table.
