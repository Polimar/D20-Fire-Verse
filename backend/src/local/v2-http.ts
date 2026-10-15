/** HTTP for heroes, the armory, the vendor, content flags, and the admin charts. */

import type { Express, Request, Response } from "express";
import { accountDb, claimSurface, type SessionUser } from "./auth.js";
import { requestUser } from "./admin-http.js";
import { analytics } from "./events.js";
import {
  addXp,
  applyLevelUp,
  applyPreset,
  archiveV1Once,
  buyStarterBundle,
  createHero,
  deleteHero,
  equip,
  forceUnequip,
  grantGold,
  levelOptions,
  listHeroes,
  listPresets,
  renameHero,
  respec,
  selectHero,
  setPreset,
  stashView,
  toggleAttune,
  unequip,
  wallet,
} from "./hero.js";
import { contentDetail, listCatalog, playbook, savePending, setPlaybook } from "./content-catalog.js";
import { engineView } from "./content-engine.js";
import { coverageSummary } from "./coverage.js";
import { labCatalog, simulateHero, stampLabHero } from "./rules-lab.js";
import { buyVendorSlot, declarePayToWin, vendorStock } from "./vendor.js";
import { enqueue, leaderboard, takeMatch, type ArenaMode } from "./arena-queue.js";
import { buyPremium, closeSeasonNow, currentSeason, skipPassTier } from "./seasons.js";
import { createCampaignHero, listCampaignHeroes } from "./campaign-hero.js";
import { addGold } from "./stash-mut.js";
import { recordEvent } from "./events.js";
import { mountBuilderRoutes } from "./builder-http.js";
import { swapWeaponMastery } from "./mastery-swap.js";
import { listHeroRedirects } from "./hero-redirect.js";

function user(req: Request): SessionUser {
  const found = requestUser(req);
  if (!found) throw new Error("AUTH_REQUIRED");
  return found;
}

function admin(req: Request): SessionUser {
  const found = user(req);
  if (found.role !== "admin") throw new Error("FORBIDDEN");
  return found;
}

function audit(actor: SessionUser, action: string, target: string, detail: Record<string, unknown> = {}): void {
  recordEvent(actor.id, null, "admin", { action, target, by: actor.username, ...detail });
}

function fail(res: Response, err: unknown): void {
  const code = err instanceof Error ? err.message : "ERROR";
  const status = code === "AUTH_REQUIRED" ? 401 : code === "FORBIDDEN" ? 403 : 400;
  res.status(status).json({ error: code });
}

const IAP: Record<string, { gold?: number; premium?: boolean; skip?: boolean }> = {
  gold_499: { gold: 10_000 },
  gold_1999: { gold: 50_000 },
  pass_premium: { premium: true },
  pass_skip: { skip: true },
};

export function mountV2Routes(app: Express): void {
  mountBuilderRoutes(app);
  app.post("/api/session/surface", (req, res) => {
    try {
      const token = (req as Request & { cookies?: Record<string, string> }).cookies?.fv_session
        ?? String(req.header("cookie") ?? "").match(/fv_session=([^;]+)/)?.[1];
      if (!token) throw new Error("AUTH_REQUIRED");
      const surface = req.body?.surface;
      if (surface !== "tv" && surface !== "web" && surface !== "companion") throw new Error("BAD_SURFACE");
      claimSurface(token, surface);
      res.json({ ok: true, surface });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/heroes", (req, res) => {
    try {
      const who = user(req);
      res.json({ heroes: listHeroes(who.id), wallet: wallet(who.id), payToWin: declarePayToWin() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes", (req, res) => {
    try {
      const who = user(req);
      const hero = createHero(who.id, req.body ?? {});
      res.json({ hero });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/select", (req, res) => {
    try {
      selectHero(user(req).id, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/heroes/:id", (req, res) => {
    try {
      const hero = listHeroes(user(req).id).find((row) => row.id === req.params.id);
      if (!hero) throw new Error("BAD_CHARACTER");
      res.json({ hero, options: levelOptions(hero.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/heroes/:id/level-options", (req, res) => {
    try {
      const hero = listHeroes(user(req).id).find((row) => row.id === req.params.id);
      if (!hero) throw new Error("BAD_CHARACTER");
      res.json(levelOptions(hero.id));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/heroes/:id/xp", (req, res) => {
    try {
      const actor = admin(req);
      const amount = Number(req.body?.amount ?? 0);
      const hero = addXp(req.params.id, amount, "admin");
      audit(actor, "hero.xp", req.params.id, { amount });
      res.json({ hero });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/level-up", (req, res) => {
    try {
      const hero = listHeroes(user(req).id).find((row) => row.id === req.params.id);
      if (!hero) throw new Error("BAD_CHARACTER");
      res.json({ hero: applyLevelUp(hero.id, req.body ?? {}) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.delete("/api/heroes/:id", (req, res) => {
    try {
      deleteHero(user(req).id, req.params.id);
      res.json({ ok: true, stash: stashView(user(req).id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/rename", (req, res) => {
    try {
      const pay = req.body?.payWith === "hard" ? "hard" : "gold";
      res.json({ hero: renameHero(user(req).id, req.params.id, String(req.body?.name ?? ""), pay) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/respec", (req, res) => {
    try {
      res.json({ hero: respec(user(req).id, req.params.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/mastery-swap", (req, res) => {
    try {
      res.json(swapWeaponMastery(user(req).id, req.params.id, String(req.body?.drop ?? ""), String(req.body?.take ?? "")));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/heroes/:id/ritual", (_req, res) => {
    res.status(410).json({ error: "RITUAL_VIA_SPELL", message: "Cast ritual-tagged spells like any other spell in combat." });
  });

  app.post("/api/heroes/:id/starter-bundle", (req, res) => {
    try {
      res.json({
        hero: buyStarterBundle(user(req).id, req.params.id, String(req.body?.itemId ?? ""), String(req.body?.receipt ?? "")),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/stash", (req, res) => {
    try {
      res.json({ stash: stashView(user(req).id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/stash/equip", (req, res) => {
    try {
      const hero = equip(user(req).id, String(req.body?.heroId ?? ""), String(req.body?.itemInstanceId ?? ""), Boolean(req.body?.inCombat));
      res.json({ hero });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/stash/unequip", (req, res) => {
    try {
      res.json({ hero: unequip(user(req).id, String(req.body?.heroId ?? ""), String(req.body?.itemInstanceId ?? "")) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/stash/force-unequip", (req, res) => {
    try {
      forceUnequip(user(req).id, String(req.body?.itemInstanceId ?? ""));
      res.json({ stash: stashView(user(req).id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/stash/attune", (req, res) => {
    try {
      toggleAttune(user(req).id, String(req.body?.heroId ?? ""), String(req.body?.itemInstanceId ?? ""), Boolean(req.body?.inCombat));
      res.json({ stash: stashView(user(req).id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/stash/presets", (req, res) => {
    try {
      const who = user(req);
      const heroId = String(req.body?.heroId ?? "");
      if (req.body?.presetId) {
        res.json({ hero: applyPreset(who.id, heroId, String(req.body.presetId)) });
        return;
      }
      setPreset(who.id, heroId, String(req.body?.name ?? "Preset"));
      res.json({ presets: listPresets(who.id, heroId) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/vendor", (req, res) => {
    try {
      user(req);
      res.json({ day: new Date().toISOString().slice(0, 10), payToWin: declarePayToWin(), slots: vendorStock() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/vendor/buy", (req, res) => {
    try {
      const who = user(req);
      const item = buyVendorSlot(who.id, String(req.body?.itemId ?? ""));
      res.json({ item, wallet: wallet(who.id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/iap", (req, res) => {
    try {
      const who = user(req);
      const product = IAP[String(req.body?.productId ?? "")];
      const receipt = String(req.body?.receipt ?? "");
      if (!product || !/^iap_[A-Za-z0-9]{8,}$/.test(receipt)) throw new Error("BAD_RECEIPT");
      try {
        accountDb().prepare("INSERT INTO iap_receipts (receipt, user_id, product_id, created_at) VALUES (?, ?, ?, ?)").run(receipt, who.id, req.body.productId, new Date().toISOString());
      } catch {
        throw new Error("RECEIPT_USED");
      }
      if (product.gold) addGold(who.id, product.gold);
      if (product.premium) buyPremium(who.id);
      if (product.skip) skipPassTier(who.id);
      recordEvent(who.id, null, "iap", { productId: req.body.productId });
      res.json({ ok: true, payToWin: declarePayToWin(), wallet: wallet(who.id), season: currentSeason() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/season", (req, res) => {
    try {
      user(req);
      res.json({ season: currentSeason() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/season/close", (req, res) => {
    try {
      const actor = admin(req);
      const out = closeSeasonNow();
      audit(actor, "season.close", out.closed.id, { opened: out.opened.id });
      res.json({ season: out.opened, closed: out.closed });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/migrate/redirects", (req, res) => {
    try {
      admin(req);
      res.json({ redirects: listHeroRedirects() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/lab/coverage", (req, res) => {
    try {
      admin(req);
      res.json({ classes: coverageSummary() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/lab/options", (req, res) => {
    try {
      admin(req);
      const catalog = labCatalog();
      res.json({
        classes: catalog.classes.map((row) => ({ id: row.id, name: row.name })),
        subclasses: catalog.subclasses.map((row) => ({ id: row.id, classId: row.classId, name: row.name })),
        species: (catalog.species ?? []).map((row) => ({ id: row.id, name: row.name })),
        coverage: coverageSummary(),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/lab/simulate", (req, res) => {
    try {
      admin(req);
      res.json(simulateHero(req.body ?? {}));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/lab/stamp", (req, res) => {
    try {
      const actor = admin(req);
      const hero = stampLabHero(actor.id, req.body ?? {});
      audit(actor, "lab.stamp", hero.id, { classId: hero.classes[0]?.id, level: hero.level });
      res.json({ hero });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/content/stats", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      const entries = listCatalog();
      res.json({
        total: entries.length,
        inPlay: entries.filter((entry) => entry.inPlay).length,
        needsReview: entries.filter((entry) => entry.reviewStatus === "needs_review").length,
        playbook: playbook(),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/content/:kind/:id", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      const detail = contentDetail(req.params.kind, req.params.id);
      res.json({ ...detail, engine: engineView(req.params.kind, req.params.id, detail.game, detail.inPlay === true) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/content/playbook/:id", (req, res) => {
    try {
      const actor = admin(req);
      setPlaybook(req.params.id, Boolean(req.body?.done));
      audit(actor, "content.checklist", req.params.id, { done: Boolean(req.body?.done) });
      res.json({ playbook: playbook() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/content/queue/:id", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      savePending(req.params.id, req.body ?? {});
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/gold", (req, res) => {
    try {
      const who = user(req);
      res.json(grantGold(who, String(req.body?.userId ?? who.id), Number(req.body?.amount)));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/analytics", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      res.json(analytics());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/matchmaking", (req, res) => {
    try {
      const who = user(req);
      const queue = req.body?.queue;
      if (queue !== "solo" && queue !== "duo" && queue !== "full_team") throw new Error("BAD_PARTY");
      const mode = req.body?.mode;
      if (mode !== "ranked" && mode !== "arcade" && mode !== "test") throw new Error("ARENA_BAD_FORMAT");
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [who.id];
      if (!userIds.includes(who.id)) throw new Error("FORBIDDEN");
      const levels = Array.isArray(req.body?.heroLevels) ? req.body.heroLevels.map(Number) : [1];
      const ticket = enqueue({ userIds, heroLevels: levels, queue });
      const paired = takeMatch(queue);
      res.json({ ticket, paired: paired ?? null, mode: mode as ArenaMode });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/arena/board", (req, res) => {
    try {
      user(req);
      const mode = req.query.mode === "arcade" || req.query.mode === "test" ? req.query.mode : "ranked";
      const queue = req.query.queue === "duo" || req.query.queue === "full_team" ? req.query.queue : "solo";
      res.json({ mode, queue, rows: leaderboard(mode, queue) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/campaign-heroes", (req, res) => {
    try {
      const who = user(req);
      res.json({
        hero: createCampaignHero({
          userId: who.id,
          campaignId: String(req.body?.campaignId ?? "luppolandia-brew"),
          name: String(req.body?.name ?? "Hero"),
          classId: req.body?.classId ? String(req.body.classId) : undefined,
          species: req.body?.species ? String(req.body.species) : undefined,
          presetId: req.body?.presetId ? String(req.body.presetId) : undefined,
        }),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/campaign-heroes", (req, res) => {
    try {
      const who = user(req);
      res.json({ heroes: listCampaignHeroes(who.id, String(req.query.campaignId ?? "luppolandia-brew")) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/admin/archive-v1", (req, res) => {
    try {
      const actor = admin(req);
      const out = archiveV1Once();
      audit(actor, "archive.v1", "legacy", out);
      res.json(out);
    } catch (err) {
      fail(res, err);
    }
  });
}
