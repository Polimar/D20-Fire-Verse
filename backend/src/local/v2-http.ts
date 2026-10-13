/** HTTP for heroes, the armory, the vendor, content flags, and the admin charts. */

import type { Express, Request, Response } from "express";
import { accountDb, claimSurface, type SessionUser } from "./auth.js";
import { requestUser } from "./admin-http.js";
import { analytics } from "./events.js";
import {
  applyLevelUp,
  applyPreset,
  archiveV1Once,
  buyStarterBundle,
  createHero,
  deleteHero,
  equip,
  forceUnequip,
  grantGold,
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
import { listCatalog, savePending, setContentEnabled } from "./content-catalog.js";
import { buyVendorSlot, declarePayToWin, vendorStock } from "./vendor.js";
import { enqueue, leaderboard, takeMatch, type ArenaMode } from "./arena-queue.js";
import { buyPremium, closeSeasonIfDue, currentSeason, skipPassTier } from "./seasons.js";
import { createCampaignHero, listCampaignHeroes } from "./campaign-hero.js";
import { addGold } from "./stash-mut.js";
import { recordEvent } from "./events.js";

function user(req: Request): SessionUser {
  const found = requestUser(req);
  if (!found) throw new Error("AUTH_REQUIRED");
  return found;
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
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      res.json({ season: closeSeasonIfDue(new Date(Date.now() + 61 * 24 * 60 * 60 * 1000)) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/admin/content", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      res.json({ entries: listCatalog() });
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

  app.post("/api/admin/content/:kind/:id", (req, res) => {
    try {
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      res.json({ entry: setContentEnabled(req.params.kind, req.params.id, Boolean(req.body?.enabled)) });
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
      if (user(req).role !== "admin") throw new Error("FORBIDDEN");
      res.json(archiveV1Once());
    } catch (err) {
      fail(res, err);
    }
  });
}
