#!/usr/bin/env npx tsx
/**
 * Enable priority arena magic items (idempotent). Run after deploy or locally:
 *   npx tsx backend/scripts/enable-arena-magic-items.ts
 */

import { openAuth } from "../src/local/auth.js";
import { enableArenaMagicItems, ensureForgeContentDefaults } from "../src/local/content-catalog.js";
import { boot } from "../test/helpers.js";

boot();
openAuth();
ensureForgeContentDefaults();
const n = enableArenaMagicItems();
console.log(`Arena magic items: ${n} newly enabled (priority list).`);
