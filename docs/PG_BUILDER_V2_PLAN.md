# Piano PG Builder V2 (SRD 5.2.1)

Documento di riferimento per implementazione e brief Cursor, fase per fase.  
**Ultimo aggiornamento decisioni owner:** 2026-10-14.

## Scopo

Sostituire il Forge legacy **SRD 5.1** (`srd51.json`, `/api/chargen`, `tv/src/chargen-ui.ts`, forge in `companion/src/pocket.ts`) con un **character builder V2** che crea solo PG `hero_*`, guidato da contenuto **SRD 5.2.1** abilitato in admin, con scheda derivata **ricalcolata da zero** a ogni modifica (no dati derivati stale come su Roll20).

**Riferimenti interni (non committare testo PHB):** inventario meccaniche PHB 2024 come checklist; note UX Roll20 builder; codice in `packages/rules`, `backend/src/local/hero*.ts`, `content/srd-5.2.1/`.

**Release unica:** il builder V2 va in produzione **nello stesso release** in cui si rimuove il Forge 5.1 e si migra `custom_*` → `hero_*`.

---

## Decisioni owner (vincolanti)

| # | Decisione |
|---|-----------|
| 1 | I PG `custom_*` esistenti vengono **convertiti automaticamente** in `hero_*` V2. |
| 2 | Builder su **sito** (route tipo `/forge`) **e** **companion** (PWA mobile-first ridisegnata). Companion loggato: **solo dati utente**, **niente** lettore QR. |
| 3 | Creazione **solo da livello 1** per i player; **admin** può creare a qualsiasi livello. |
| 4 | Catalogo builder = **solo** righe **enabled** in `/admin` Content. |
| 5 | Punteggi abilità: **standard array**, **point buy** e **roll** tutti in v1. |
| 6 | Bonus background: scelta **+2/+1** o **+1/+1/+1** con validazione (abilità duplicate rifiutate). |
| 7 | Conteggi incantesimi (es. spellbook Wizard L1 = 6): **priorità numeri PHB 2024** dove il taglio SRD non basta; in repo resta solo testo **SRD CC-BY**. |
| 8 | Incantesimi **preparati**: scelta **obbligatoria** del giocatore. |
| 9 | Equipaggiamento iniziale: al **commit** va **subito nello stash** (istanze), non solo snapshot nel draft. |
| 10 | Step **Lingue** e **About** **opzionali**. |
| 11 | **Niente multiclass** alla creazione L1; admin può forzare eccezioni. |
| 12 | **Parità D-pad Fire TV** dal primo rilascio del builder (stessi step e API del web). |
| 13 | Testi UI: dove esiste testo **SRD 5.2.1**, usarlo; contenuto solo PHB → **riassunto meccanico** in parole nostre (**mai** testo PHB). |
| 14 | Rimozione Forge 5.1 (**stesso release** del nuovo builder). |

---

## Principi tecnici

1. **Server authoritative:** `POST /api/builder/preview` ricalcola tutta la scheda da un `HeroDraft` (scelte only).
2. **Un solo motore di derive** condiviso da preview, commit, `hero-pregen`, combattimento (obiettivo).
3. **English** per UI di gioco; questo doc in italiano per il team.
4. **Legal:** solo SRD 5.2.1 in `content/`; attribuzione CC-BY come da `ATTRIBUTION.md`.

### Flusso step builder (allineato Roll20, adattato V2)

`Classe → Specie → Background → Abilità → Feat → Skill → Incantesimi (se caster) → Equipaggiamento → About (opz.) → Review → Crea`

Panel laterale: scheda live (HP, CA, prof, skill con modificatore, passive, attacchi da equip, slot, risorse L1).

---

## Parte A — Gap analysis (motore vs SRD 5.2.1 / checklist PHB 2024)

Legenda: **Completo** | **Parziale** | **Assente**.

### A.1 Regole core (tiri d20, azioni, combattimento, danni, riposi)

| Meccanica | Stato | File / note |
|-----------|--------|-------------|
| Modificatore abilità, PB per livello | Completo | `packages/rules` `abilityMod`; `content/srd-5.2.1/classes.json`; `hero-pregen.ts` |
| Tiro per colpire | Completo | `backend/src/local/combat.ts` |
| Vantaggio / svantaggio | Parziale | `d20Mode` in `combat.ts`; non su ogni tiro |
| Prove abilità (story) | Parziale | `coop.ts` `playerCheckBonus`; no Expertise, tool, passive |
| Tiri salvezza | Parziale | `srd-sheet.ts` `saveBonuses`; feature classe incomplete |
| Skill + proficienza | Parziale | `hero.skills` / `progression.ts`; scheda solo nomi (`protocol/sheet.ts`) |
| Passive (Perception, ecc.) | Assente | Richiesto dal builder |
| Expertise | Assente | `coverage.ts` Rogue: solo storage |
| Tool proficiency (regola 2024) | Assente | `backgroundDef.tools` in schema, non applicato |
| Heroic Inspiration | Parziale | `combat.ts`; grant specie Human non modellati |
| Azioni standard (subset) | Parziale | Dash/Dodge/Help/Hide in combattimento |
| Influence, Study, Ready | Assente | — |
| Unarmed 2024 | Parziale | `unarmed_strike` |
| Opportunity attack | Parziale | `combat.ts` reazioni |
| Two-weapon / Light | Parziale | Nick mastery; TWF in `coverage.ts` |
| Copertura | Assente | Griglia senza AC copertura |
| Tipi danno, resistenze | Parziale | Rage, gear in `hero-pregen` |
| Critici | Completo | `critNotation` |
| PF temporanei | Assente | — |
| Death saves | Parziale | `resolveDeathSave` in `combat.ts` |
| Exhaustion 2024 (6 livelli) | Assente | — |
| Short / long rest | Parziale | `srd-sheet.ts`; no exhaustion −1 |
| Hit dice (short rest) | Parziale | Contatore `hitDice` semplificato |

### A.2 Condizioni (15)

| Meccanica | Stato | File / note |
|-----------|--------|-------------|
| Tag condizione su token | Parziale | `combat.ts` `conditions` |
| Glossario completo 15 condizioni | Parziale | Sottoinsieme con effetti |
| Exhaustion | Assente | — |
| Concentration (incantesimi) | Parziale | `concentrating`, `concentrationCheck` |

### A.3 Creazione personaggio

| Meccanica | Stato | File / note |
|-----------|--------|-------------|
| Flusso classe/specie/background | Parziale | `createHero` senza builder UI |
| Scelte specie strutturate | Parziale | `species.json` + testo in `review/species/` |
| Background ASI, feat, equip | Parziale | `backgrounds.json`; non applicati in `createHero` |
| Array / PB / roll su V2 | Assente | Solo legacy `chargen.ts` |
| ASI background dopo punteggi | Assente | **Richiesto builder v1** |
| Equip iniziale completo | Parziale | Solo `CLASS_PACK` un’arma |
| HP L1 | Completo | `progression.ts` `hpAtLevelOne` |
| Multiclass a creazione | Assente per player | Admin override da definire in API |
| Tabella XP L1–20 | Completo | `xp-table.json` |

### A.4 Classi e sottoclassi (12 + 12 SRD)

| Meccanica | Stato | File / note |
|-----------|--------|-------------|
| Tabelle L1–20 (dati) | Completo | `classes.json` |
| Esecuzione combattimento L1–10 | Parziale | `coverage.ts`; 4 classi dettagliate, 8 “partial” |
| Cap livello giocabile | Completo | `classLevelCap` |
| ASI / feat / fighting style | Parziale | `applyPick`; effetti feat limitati |
| Weapon mastery | Parziale | `mastery.ts`; no pick salvati sul PG |
| Prepared vs spellbook | Parziale | `preparedSpells` in JSON; no campi hero separati |
| Pact / multiclass slot | Parziale | `multiclassSlots` |
| Risorse (Rage, Ki, …) | Parziale | `class-kit.ts`, `initSheet` |

### A.5 Specie, background, feat, equip, incantesimi, scheda, pipeline

| Area | Stato | File / note |
|------|--------|-------------|
| Specie (9) | Parziale | Traits stringa; Human Resourceful/Skillful/Versatile non strutturati |
| Background (4) | Parziale | Skill/feat in JSON; merge a creazione assente |
| Feat (17) | Parziale | Catalogo + pick; meccaniche spesso `notModeled` |
| Item gear/magic | Completo (dati) | `items/*.json` |
| AC / armi da loadout | Parziale | `hero-pregen.ts`; attacchi in scheda builder **da fare** |
| Incantesimi combat | Parziale | `parse-spells.ts`; subset `spell_*` |
| Rituali | Assente | Flag su spell |
| Prepared enforcement | Assente | **Obbligatorio per owner** |
| `PcSheet` / library `hero_*` | Parziale / Assente | `librarySheet` solo `custom_*` oggi |
| Import SRD | Completo | `tools/srd-parser`; 347 `needs_review`, 400 `notModeled` |

---

## Parte B — Fasi di implementazione (brief Cursor)

Ogni fase è un **PR reviewabile** (o insieme di PR strettamente sequenziali). Prima di merge: `npm run typecheck && NARRATION=off npm test && npm run build`.

### Fase 1 — Derive puro + API preview

**Obiettivo:** motore `draft → DerivedSheet` senza persistenza; base per UI e commit.

**Task:**

- Aggiungere `packages/rules/src/derive-hero.ts` (nome definitivo): input `HeroDraft` (livello, classe, specie, background, metodo punteggi, `baseAbilities`, boost background, skill picks, feat ids, spellbook, prepared, cantrips, mastery picks, equip scelto A/B, opzionale About).
- Output `DerivedSheet`: abilità+mod, save con bonus, **18 skill con mod**, passive Perception/Insight/Investigation, CA, HP, speed, PB, DC/attack spell, **righe attacco** da armi equip, slot, risorse L1, `pendingChoices`, `unfinishedSteps[]`, `errors[]`.
- Regola: **ogni chiamata preview ricalcola tutto** (nessun merge con stato precedente lato client).
- Tipi condivisi: `packages/protocol/src/builder.ts`.
- API backend:
  - `GET /api/builder/catalog` — solo `enabledById` / `progressionCatalog()` (classi, specie, background, feat, spell, item rilevanti).
  - `POST /api/builder/preview` — draft → `{ sheet, pending, unfinishedSteps, errors }`.
- Admin: accettare `level` > 1 nel draft solo se sessione admin.
- Applicare regola numeri **PHB 2024** per conteggi (es. spellbook Wizard L1 = 6) in costanti documentate nel derive, non copiando testo PHB.

**File:** `packages/rules/src/derive-hero.ts`, `packages/rules/src/index.ts`, `packages/protocol/src/builder.ts`, `backend/src/local/builder-http.ts` (nuovo), mount in `server.ts`.

**Test:** unit in `packages/rules` (Fighter L1 + Wizard L1: CA, HP, 4 prepared, 6 spellbook, attacchi da arma); test API in `backend/test/builder.test.ts`.

**Criteri accettazione:**

- Cambiare una scelta nel draft cambia **tutti** i campi derivati (test: umano senza darkvision fantasma).
- Catalogo vuoto se admin non ha abilitato nulla.

---

### Fase 2 — Dati SRD strutturati (origini)

**Obiettivo:** campi machine-readable per scelte builder (testo SRD in JSON/review).

**Task:**

- Estendere `packages/content-schema`: `SpeciesDef` (scelte size/lineage/skill/feat), `BackgroundDef` (`abilityBoostOptions`, pacchetti equip A / 50 gp, tools), `ClassDef` (`startingEquipment`, `spellbookSize` per livello, conteggi allineati PHB 2024 dove richiesto).
- Aggiornare `tools/srd-parser/src/import-catalog.ts` per popolare i campi da SRD; PHB-only → solo numeri/flag + `mechanicalSummary` in inglese (parole nostre).
- Validare: `npm run content:validate`.

**File:** `packages/content-schema`, `content/srd-5.2.1/*`, `tools/srd-parser`.

**Test:** snapshot Zod per specie/background; derive Fase 1 legge i nuovi campi.

**Criteri accettazione:** admin Content mostra grant strutturati; preview applica skill/feat background quando enabled.

---

### Fase 3 — Persistenza hero + commit

**Obiettivo:** `POST /api/builder/commit` (o estensione `POST /api/heroes`) crea `hero_*` identico al preview.

**Task:**

- Schema SQLite / JSON: `cantrips_json`, `spellbook_json`, `spells_prepared_json`, `feats_json`, `weapon_mastery_picks_json`, `tool_proficiencies_json`, `builder_meta_json` (metodo punteggi, boost background), About opzionale.
- `commitBuilderDraft(userId, draft)`:
  - Valida come preview.
  - Merge proficienze (background + specie + classe).
  - Applica ASI background (+2/+1 o +1/+1/+1).
  - Grant feat origin (background + specie + fighting style L1 se tabella classe).
  - `firstLevel` + risolvi `pending` L1 (cantrip/spell prepared obbligatori).
  - **Stash:** istanze item per equip classe A/B + background; equip opzionale default su PG.
- Player: `level` forzato a 1; admin: livello libero + multiclass se draft admin.

**File:** `backend/src/local/hero.ts`, `v2-http.ts`, migrazione SQL in `auth.ts` `ensureProgressTables`.

**Test:** estendere `backend/test/v2.test.ts`; parity preview === sheet dopo commit.

**Criteri accettazione:** Wizard con esattamente N preparati e M in spellbook; Fighter con oggetti in stash.

---

### Fase 4 — Migrazione `custom_*` → `hero_*`

**Obiettivo:** conversione automatica (decisione owner #1).

**Task:**

- `backend/src/local/migrate-legacy-chargen.ts`: per ogni `backend/data/custom-characters/*.json`, mappa `raceId`/`classId`/`backgroundId` 5.1 → id SRD 5.2.1 (tabella mapping documentata nel file); costruisci draft L1 equivalente; `commitBuilderDraft` o path migrazione lossy con log.
- Script CLI o hook avvio server una tantum con flag `FIREVERSE_MIGRATE_CUSTOM=1`.
- Rinomina/archivia JSON legacy; rimuovi registrazione `custom_*` da lobby post-migrazione.
- Evento admin: conteggio migrati / falliti.

**File:** nuovo migrate module, `campaign.ts` `getPregen`, test `migrate-chargen.test.ts`.

**Criteri accettazione:** ogni `custom_*` con owner valido diventa `hero_*` giocabile o voce in report errori; nessun `custom_*` in `/api/pregens` dopo migrazione.

---

### Fase 5 — UI condivisa + `/forge` (TV / sito)

**Obiettivo:** wizard con parità **D-pad** (decisione #12); route sito `/forge` (o nome finale) sul bundle TV.

**Task:**

- Modulo UI condiviso (es. `packages/builder-ui/` o `tv/src/forge-v2/` esportato): step machine, focus trap D-pad, chiamate debounced a `/api/builder/preview`.
- Step Feat: fighting style classe, origin background/specie, Magic Initiate con scelte lista/ability/spell.
- Step Abilità: array, PB 27, roll server (`POST /api/builder/roll` — sostituisce `/api/chargen/roll`).
- Step Background ASI: UI +2/+1 vs +1/+1/+1.
- Step Spells: cantrip + spellbook + **preparati obbligatori**.
- Step Equip: scelta A/B classe + background; preview attacchi aggiornati.
- About opzionale (lingue, allineamento, testo libero).
- Review: elenco step incompleti da `unfinishedSteps`.

**File:** `tv/src/forge-v2.ts`, `tv/src/main.ts` (route), CSS, rimuovere **in questo release** mount `chargen-ui` e `btnForge` 5.1.

**Test:** smoke Playwright o test DOM leggeri se esistenti; manuale D-pad checklist in PR.

**Criteri accettazione:** stesso draft da tastiera e D-pad; scheda mostra attacchi arma equip.

---

### Fase 6 — Companion PWA ridisegnata

**Obiettivo:** builder + armory; **no QR** se loggato (decisione #2).

**Task:**

- Ridisegno layout mobile-first companion (`companion/src/`).
- Stato non in tavolo: lista `hero_*`, forge, armory, social — **senza** `mount` camera/QR.
- Stato in tavolo (pairing attivo): comportamento attuale controller + sheet.
- Integrare stesso modulo forge Fase 5.
- Rimuovere forge legacy `pocket.ts` → `/api/chargen`.

**File:** `companion/src/main.ts`, `pocket.ts`, PWA manifest se serve.

**Criteri accettazione:** utente loggato non vede UI scanner; forge crea `hero_*`.

---

### Fase 7 — Library e scheda `hero_*`

**Obiettivo:** scheda post-creazione coerente con preview.

**Task:**

- `librarySheet` / API per `hero_*` (`GET /api/heroes/:id/sheet`).
- Estendere `pcSheetHtml` o template `DerivedSheet` con skill mod, passive, attacchi.
- Companion e TV mostrano PG V2 in libreria.

**File:** `room.ts`, `server.ts`, `protocol/sheet.ts`, `hero-pregen.ts` (delega a derive).

**Criteri accettazione:** sheet in libreria === ultimo preview al commit.

---

### Fase 8 — Gap motore (parallelo, post-MVP builder se necessario)

PR separati; aggiornare `coverage.ts` quando una meccanica passa a **runs**.

| ID | Contenuto | File principali |
|----|-----------|-----------------|
| 8a | Expertise + skill mod in prove | `coop.ts`, `derive-hero.ts` |
| 8b | Heroic Inspiration (Human Resourceful, ecc.) | species grants, `combat.ts` |
| 8c | Exhaustion 2024 | `combat.ts`, long rest |
| 8d | PF temporanei | `combat.ts` |
| 8e | Prepared vs spellbook in combattimento | `hero.ts`, menu spell |
| 8f | Rituali (fuori combattimento) | protocol + stub |
| 8g | Esecuzione feat origin (Alert, Magic Initiate, …) | feat → features/spells |
| 8h | Weapon mastery pick + swap long rest | hero row, UI |
| 8i | Copertura classi rimanenti L1–10 | `coverage.ts`, `combat.ts` |

---

### Fase 9 — Release: rimozione Forge 5.1

**Obiettivo:** decisione owner #14 — **stesso deploy** del builder V2.

**Task (checklist release):**

- Rimuovere: `GET/POST /api/chargen`, `backend/src/local/chargen.ts` (o ridurre a migrazione), `content/chargen/srd51.json` dal path runtime, `tv/src/chargen-ui.ts`, test `chargen.test.ts`, copy README che cita forge 5.1 come path attivo.
- Aggiornare `content/chargen/README.md` (solo storico).
- Verificare migrazione `custom_*` eseguita.
- Abilitare in admin almeno un set minimo per smoke (classe, specie, background, feat, spell, item).
- Aggiornare `docs/FRICTION_LOG.md` se utile.

**Criteri accettazione:** CI verde; nessun endpoint/UI 5.1; solo `hero_*` + pregens campagna in selezione eroe.

---

## Parte C — Mappa file

| Area | Percorso |
|------|----------|
| Hero V2 | `backend/src/local/hero.ts`, `v2-http.ts` |
| Pregen / scheda combattimento | `hero-pregen.ts`, `combat.ts`, `srd-sheet.ts` |
| Progressione | `packages/rules/src/progression.ts` |
| Loadout | `packages/rules/src/loadout.ts` |
| Weapon mastery | `packages/rules/src/mastery.ts` |
| Sheet HTML | `packages/protocol/src/sheet.ts` |
| Contenuto | `content/srd-5.2.1/`, `content-catalog.ts` |
| Schema | `packages/content-schema/src/index.ts` |
| Coverage combattimento | `backend/src/local/coverage.ts` |
| Legacy (da rimuovere in Fase 9) | `chargen.ts`, `chargen-ui.ts`, `srd51.json` |

---

## Parte D — Uso come brief Cursor

Per avviare un agente su una fase, incollare:

```text
Implementa la Fase N di docs/PG_BUILDER_V2_PLAN.md.
Rispetta le decisioni owner in tabella in cima al doc.
Non espandere scope oltre la fase. English per UI e codice.
```

Ordine consigliato: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 9**; Fase **8** in parallelo dopo Fase 3; Fase **4** e **6** possono condividere il modulo UI dopo Fase 1.

---

## Parte E — Rischi residui

- **347** entry `needs_review` e **400** `notModeled`: abilitare in admin solo set verificato per il builder.
- Mapping 5.1 → 5.2.1 in migrazione: documentare perdita dati (domini chierico 5.1, subrace, livello 2–3 legacy).
- PHB 2024 vs SRD: numeri PHB solo dove owner ha dato priorità; non importare testo PHB.
