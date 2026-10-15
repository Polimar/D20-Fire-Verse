import type { Express, Request, Response } from "express";
import type { BuilderDraft } from "@d20-fireverse/protocol/builder";
import { deriveHero } from "@d20-fireverse/rules";
import { rollDie } from "@d20-fireverse/rules";
import { requestUser } from "./admin-http.js";
import type { SessionUser } from "./auth.js";
import { builderCatalog, classDefForBuilder } from "./builder-catalog.js";
import { commitBuilderDraft } from "./builder-commit.js";
import { heroDerivedSheet } from "./hero-sheet.js";
import { notifyHeroLibraryChanged } from "./hero-library.js";

function user(req: Request): SessionUser {
  const found = requestUser(req);
  if (!found) throw new Error("AUTH_REQUIRED");
  return found;
}

function fail(res: Response, err: unknown): void {
  const code = err instanceof Error ? err.message : "ERROR";
  const status = code === "AUTH_REQUIRED" ? 401 : 400;
  res.status(status).json({ error: code });
}

export function rollAbilityScores(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)].sort((a, b) => b - a);
    out.push(rolls[0]! + rolls[1]! + rolls[2]!);
  }
  return out;
}

export function mountBuilderRoutes(app: Express): void {
  app.get("/api/builder/catalog", (req, res) => {
    try {
      user(req);
      res.json(builderCatalog());
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/builder/preview", (req, res) => {
    try {
      user(req);
      const draft = req.body as BuilderDraft;
      const catalog = builderCatalog();
      const cls = classDefForBuilder(draft.classId);
      const l1 = cls?.levels.find((row) => row.level === 1);
      const sheet = deriveHero(draft, catalog, cls ? { hitDie: cls.hitDie, saves: cls.saves, spellSlotsL1: l1?.spellSlots } : undefined);
      res.json({ sheet });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/builder/commit", (req, res) => {
    try {
      const who = user(req);
      const hero = commitBuilderDraft(who, req.body as BuilderDraft);
      notifyHeroLibraryChanged(who.id);
      res.json({ hero });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/builder/roll", (req, res) => {
    try {
      user(req);
      res.json({ scores: rollAbilityScores() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/api/heroes/:id/sheet", (req, res) => {
    try {
      const who = user(req);
      const sheet = heroDerivedSheet(who.id, req.params.id);
      if (!sheet) throw new Error("BAD_CHARACTER");
      res.json({ sheet });
    } catch (err) {
      fail(res, err);
    }
  });
}
