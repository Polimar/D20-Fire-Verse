# Piano prodotto: PG Builder V2 + motore SRD 5.2.1 completo (L1–20)

Documento di riferimento per implementazione e **brief Cursor**, fase per fase.  
**Ultimo aggiornamento:** 2026-10-15 (re-scope completezza AAA).

---

## Obiettivo esplicito (north star)

**Completezza di gioco end-to-end dal livello 1 al 20** su tutto il perimetro **SRD 5.2.1** importato nel repo, con un **motore regole unico** che esegue ogni meccanica necessaria a campagna, arena, progressione e combattimento.

| Ambito | Target |
|--------|--------|
| Contenuto SRD 5.2.1 abilitato in admin | **100%** delle righe catalogo **eseguibili** (non solo elencate in scheda) |
| Classi + sottoclassi SRD | **12 + 12**, livelli **1–20**, ogni feature in tabella con stato `runs` in `coverage.ts` |
| Specie, background, feat, incantesimi, oggetti, mostri SRD | **Tutti** gli id nel catalogo con comportamento definito o errore esplicito se disabilitati |
| Regole core 2024 (checklist PHB 2024) | **Implementate** nel motore; dove il PDF SRD è silente, **riferimento meccanico PHB 2024** → implementazione come **riassunto meccanico in parole nostre** (inglese in codice/UI), **mai** testo PHB nel repo |
| PG Builder V2 | Creazione **L1** per i player (regola prodotto), scheda derivata **ricalcolata da zero** a ogni scelta; **non** limita il motore a L1 |

Il builder è il **primo touchpoint** del giocatore; il motore è il **vincolo di qualità** per tutto il resto del prodotto (level-up, armory, arena PvE con mostri SRD, loot, narrativa con prove).

**Riferimenti di lavoro (allegati team, non in repo):** `phb2024-mechanics.md`, `roll20-builder-notes.md` (UX e checklist; **no** dati derivati stale).

**Release unica (decisione owner):** builder V2 + rimozione Forge 5.1 + migrazione `custom_*` → `hero_*` nello **stesso deploy**.

---

## Decisioni owner (vincolanti)

| # | Decisione | Nota scope motore |
|---|-----------|-------------------|
| 1 | `custom_*` → `hero_*` **conversione automatica** | — |
| 2 | Builder su **sito** (`/forge`) **e** **companion** PWA ridisegnata; loggato = **solo dati utente**, **no QR** | — |
| 3 | **Player:** creazione solo **L1**; **admin:** qualsiasi livello / eccezioni | Il motore supporta **L1–20** per tutti |
| 4 | Builder mostra solo contenuto **enabled** in admin | Stesso catalogo alimenta combattimento e progressione |
| 5 | Punteggi: **standard array**, **point buy**, **roll** nel builder al rilascio | Validazione server identica per qualsiasi livello (admin) |
| 6 | Background ASI: **+2/+1** o **+1/+1/+1** con validazione | — |
| 7 | Se SRD non specifica un numero/regola, **PHB 2024** come riferimento meccanico; in repo solo SRD verbatim + `mechanicalSummary` nostro | Applica a spellbook, conteggi, riposi, ecc. |
| 8 | Incantesimi **preparati**: scelta **obbligatoria** del giocatore | Spellbook vs prepared enforced anche a L20 |
| 9 | Equip iniziale → **stash** istanze al commit | — |
| 10 | Step Lingue / About **opzionali** | — |
| 11 | **No multiclass** alla **creazione** L1 (player); admin libero | Multiclass **L2–20** nel motore |
| 12 | **Parità D-pad Fire TV** al rilascio builder | — |
| 13 | Testi UI: testo **SRD 5.2.1** dove esiste; altrimenti riassunto meccanico nostro | — |
| 14 | Rimozione Forge 5.1 **stesso release** del builder V2 | — |

---

## Principi tecnici

1. **Server authoritative:** preview/commit/level-up/combat usano le stesse funzioni in `packages/rules` (+ adapter backend).
2. **Ricalcolo totale:** ogni `POST /api/builder/preview` deriva la scheda **solo** dal draft (anti-Roll20 stale).
3. **English** UI/codice; questo doc in italiano.
4. **Legal:** `content/srd-5.2.1/` = testo SRD CC-BY; gap PHB = `mechanicalSummary` + logica in codice, **zero** paste PHB.
5. **Nessun cap artificiale al motore:** `classLevelCap` in `coverage.ts` oggi è un **debito** da portare a **20** per ogni classe/sottoclasse SRD, non una feature.

---

## Matrice di coverage (target 100%)

Aggiornare questa tabella a ogni merge che chiude una fase. **Executable** = con test automatico o `coverage.ts` = `runs` / `progression` / `no_combat` documentato.

### Contenuto catalogo (`content/srd-5.2.1`)

| Kind | Id SRD (import) | Executable target | Checklist |
|------|-----------------|-------------------|-----------|
| species | 9 | 9/9 | ☐ |
| background | 4 | 4/4 | ☐ |
| class | 12 | 12/12 L1–20 | ☐ |
| subclass | 12 | 12/12 L1–20 | ☐ |
| feat | 17 | 17/17 | ☐ |
| spell | 339 | 339/339 (cast, ritual, upcast dove applicabile) | ☐ |
| item (gear) | 51+ | tutti con slot/effects | ☐ |
| item (magic) | 276+ | tutti con effects/attunement/charges | ☐ |
| monster | 235 | 235/235 in `srd-monsters` combat | ☐ |
| weapon-mastery | 8 proprietà | 8/8 in `mastery.ts` + UI pick | ☐ |

### Motore regole (checklist PHB 2024 → codice)

| Area | Componenti | Target | Checklist |
|------|------------|--------|-----------|
| D20 tests | adv/dis, group checks, passive scores, contests | 100% | ☐ |
| Skills | 18 skill, proficiency, **expertise**, tool + advantage 2024 | 100% | ☐ |
| Saves | tutte le abilità, prof, condizioni | 100% | ☐ |
| Heroic Inspiration | grant/spend/gift, Human Resourceful, Champion, ecc. | 100% | ☐ |
| Azioni standard (12) | Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize | 100% | ☐ |
| Economia turno | action/bonus/move/reaction, object interaction | 100% | ☐ |
| Unarmed 2024 | PB, grapple, shove | 100% | ☐ |
| Combattimento | init, surprise, OA, cover, ranged rules, crit, resist/vuln/immune order | 100% | ☐ |
| Danno / guarigione | temp HP, bloodied, knock-out, instant death | 100% | ☐ |
| Death saves | full 2024 + damage at 0 | 100% | ☐ |
| Exhaustion | 6 livelli 2024 | 100% | ☐ |
| Short / long rest | HD spend, slot/feature reset, exhaustion −1 | 100% | ☐ |
| Condizioni | tutte **15** + non-stack + exhaustion levels | 100% | ☐ |
| Concentration | break DC, drop on incapacitate | 100% | ☐ |
| Incantesimi | prepared, spellbook, known, pact, ritual, upcast, cantrip scale, summon/conjure | 100% | ☐ |
| Multiclass | prereq, slots, prepared per classe, prof package | 100% | ☐ |
| Weapon mastery | pick, swap long rest, tutte le mastery | 100% | ☐ |
| Progressione | XP, ASI, epic boon 19, level-up choices L2–20 | 100% | ☐ |

**Gate CI (obiettivo):** script `npm run coverage:report` (da introdurre) fallisce se qualsiasi riga **enabled** in admin è sotto 100% executable o se `coverage.ts` ha feature SRD ancora `partial`/`missing`.

---

## Parte A — Audit baseline (stato repo oggi → da chiudere a 100%)

Legenda audit: **Fatto** | **In corso** | **Da fare** (sostituisce “parziale/assente” come accettazione finale).

### A.1 Core, condizioni, creazione, classi, contenuto

| Meccanica | Audit oggi | File attuali | Stato target |
|-----------|------------|--------------|--------------|
| Modificatore, PB, attacchi, crit | Fatto | `packages/rules`, `combat.ts` | Mantieni |
| Adv/dis su tutti i tiri | Da fare | `combat.ts`, `coop.ts` | Fase 4 |
| Skill + expertise + passive + tool | Da fare | `derive-hero`, `coop.ts`, `sheet.ts` | Fase 4 |
| Heroic Inspiration | Da fare | `combat.ts`, species grants | Fase 4 |
| 12 azioni standard | Da fare | `combat.ts`, menu azioni | Fase 5 |
| PF temp, exhaustion, death completo | Da fare | `combat.ts` | Fase 4 |
| Rests completi | Da fare | `srd-sheet.ts`, `room.ts` | Fase 4 |
| 15 condizioni | Da fare | nuovo `conditions.ts` o modulo rules | Fase 5 |
| Builder derive + preview | Da fare | nuovo `derive-hero.ts` | Fase 7 |
| createHero / progression L1–20 | In corso | `hero.ts`, `progression.ts` | Fase 8–10 |
| Classi L1–20 esecuzione | Da fare | `coverage.ts` solo 4 classi dettagliate | Fase 9 |
| Sottoclassi L1–20 | Da fare | `class-kit`, `progression.ts` | Fase 10 |
| Tutti i feat | Da fare | feat → effects/features | Fase 11 |
| Spellbook / prepared / ritual / upcast | Da fare | `hero.ts`, `combat.ts` | Fase 6 |
| Multiclass + pact | Da fare | `progression.ts` | Fase 8 |
| Weapon mastery storage + swap | Da fare | hero row + UI | Fase 12 |
| Mostri SRD in combattimento | In corso | `srd-monsters.ts` | Fase 13 |
| Import `needs_review` / `notModeled` | Da fare | `tools/srd-parser`, catalog | Fase 2 |

---

## Parte B — Fasi di implementazione (brief Cursor)

Ogni fase chiude con: test, aggiornamento **checklist** sopra, PR reviewabile.  
Prima del merge: `npm run typecheck && NARRATION=off npm test && npm run build`.

**Ordine consigliato:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17.  
Fasi 4–6 e 9–11 possono procedere in parallelo **dopo** Fase 3 solo se le interfacce in `packages/rules` sono stabili.

---

### Fase 1 — Infrastruttura coverage e reporting

**Obiettivo:** misurare il **100%** in modo oggettivo.

**Task:**
- Estendere `backend/src/local/coverage.ts` a **tutte** le 12 classi e 12 sottoclassi SRD, livelli 1–20 (non fermarsi a L10).
- Aggiungere `docs/COVERAGE_PROGRESS.md` generato o mantenuto a mano con sync alla matrice sopra.
- Script `tools/coverage-report.ts` + `npm run coverage:report`: elenca feature `missing`/`partial`, contenuto enabled non executable.
- Regola merge: nessuna nuova riga `partial` senza issue linkata e data target.

**Criteri accettazione:**
- Report elenca ogni classe/sottoclasse con % feature `runs` su 20 livelli.
- Checklist matrice versionata nel PR che chiude la fase.

---

### Fase 2 — Pipeline contenuto SRD 5.2.1 al 100% strutturato

**Obiettivo:** ogni entry SRD ha campi machine-readable; `notModeled` → implementazione o `mechanicalSummary` + effect typed.

**Task:**
- Schema `content-schema`: specie (scelte, grants, effects), background (ASI modes, feat, tools, equip A/50gp), class (starting equipment, spellbook sizes L1–20), feat (prereq, grants, executable hooks), spell (ritual, concentration, upcast, summon), item, monster.
- Parser `import-catalog.ts`: popolare campi; dove SRD insufficiente, numeri/regole da **PHB 2024** in `mechanicalSummary` (inglese, parole nostre).
- Chiudere review queue per le 9 specie, 4 background, 12 classi prima di espandere optional content.
- Admin Content: stato `executable` vs `data_only` per riga.

**Criteri accettazione:**
- `content:validate` verde su tutti i file toccati.
- Checklist contenuto: species 9/9, backgrounds 4/4 con grants strutturati.

---

### Fase 3 — Modulo condizioni + helper tiri (foundation rules)

**Obiettivo:** unico posto per applicare condizioni a AC, attacchi, save, skill, init.

**Task:**
- `packages/rules/src/conditions.ts`: tutte le 15 condizioni + exhaustion 6 livelli (effetti su test, CA, movimento, vantaggio).
- Integrare in `combat.ts` e `coop.ts`; test per ogni condizione (tabella casi).

**Criteri accettazione:**
- Checklist condizioni 15/15 + exhaustion.
- Test: Prone + ranged, Frightened disadvantage, Grappled speed 0, ecc.

---

### Fase 4 — Core engine: danni, guarigione, riposi, inspiration, skill system

**Obiettivo:** Ch. 1 PHB checklist eseguibile in combattimento e story.

**Task:**
- PF temporanei (non stack, assorbimento prima).
- Death saves completi + danno a 0 HP + instant death + stable/stabilize.
- Exhaustion su test e speed; long rest −1 exhaustion.
- Short rest: spend HD con formula 2024; long rest: HP, HD restore, slot/feature reset documentati per classe.
- Heroic Inspiration: spend su qualsiasi dado; grant paths (Human, Champion, DM hook API se serve).
- Expertise, passive scores (10 + mod), tool proficiency e regola advantage 2024 su skill checks.
- Adv/dis su save/check/attack in modo uniforme.

**File:** `packages/rules`, `combat.ts`, `coop.ts`, `srd-sheet.ts`, `derive-hero.ts` (quando esiste).

**Criteri accettazione:**
- Checklist righe “D20 tests”, “Danno/guarigione”, “Rests”, “Heroic Inspiration”, “Skills” = ☑.
- Test integrazione per Fighter e Wizard livello 5 e 20 (snapshot numerici).

---

### Fase 5 — Azioni standard e combattimento avanzato

**Obiettivo:** menu azioni e regole posizione/copertura coerenti con griglia.

**Task:**
- Implementare Influence, Study, Utilize, Ready (con trigger), Search; estendere Help/Hide/Dodge.
- Unarmed Strike 2024 (PB, grapple, shove).
- Copertura mezza/tre quarti/totale su AC e Dex save.
- Opportunity attack, disengage, two-weapon (Light + Nick + TWF feat), mounted base se in scope SRD mostri/cavalieri.
- Bloodied flag per feature che lo richiedono.

**Criteri accettazione:**
- Checklist “Azioni standard” e “Combattimento” = ☑.
- `coverage.ts` aggiornato per feature che dipendono da queste regole.

---

### Fase 6 — Sistema incantesimi completo

**Obiettivo:** ogni spell SRD enabled è lanciabile o ritualizzabile con regole corrette.

**Task:**
- Modello hero: `spellbook`, `prepared`, `cantrips`, slot per classe; warlock **pact** separato.
- Ritual casting (Ritual Adept, tempo ritual, no slot).
- Upcast da `SpellMechanics`; cantrip scaling L5/11/17.
- Concentrazione già presente — allineare a condizioni Incapacitated.
- Generazione/aggiornamento `spell_*` abilities per **tutti** gli incantesimi enabled (pipeline da `SpellDef`).
- Summon/conjure: almeno comportamento token o placeholder server-authoritative documentato per ogni spell taggato summon in catalogo.

**Criteri accettazione:**
- Checklist spell 339/339 executable per id enabled in fixture test.
- Wizard L20: prepared count da tabella, spellbook growth PHB/SRD rules.

---

### Fase 7 — Derive hero L1–20 + API builder

**Obiettivo:** `derive-hero` per **qualsiasi** livello e draft; builder usa L1 player.

**Task:**
- `packages/rules/src/derive-hero.ts`: input `HeroDraft` / `HeroState`; output `DerivedSheet` completa (skill mod, passive, attacks, slots, resources, pending L2–20).
- `GET /api/builder/catalog`, `POST /api/builder/preview`, `POST /api/builder/roll`.
- Admin: `level` e multiclass nel draft; player: `level` = 1 enforced.
- PHB fill-in per conteggi documentati in Fase 2.

**Criteri accettazione:**
- Preview identico per admin a livello 20 con multiclass noto (fixture).
- Player L1: stessi criteri owner (preparati obbligatori, ASI background, tre metodi punteggi).

---

### Fase 8 — Progressione, multiclass, pact magic L1–20

**Obiettivo:** `progression.ts` + `applyPick` coprono ogni livello e ogni `PendingAsk`.

**Task:**
- Multiclass: prereq, prof package, slot table completa, prepared per classe.
- Pact slots warlock + multiclass con caster levels.
- ASI, feat (general, origin, fighting style, epic), skill grants, subclass levels, spell picks ogni livello.
- `toProgress` fix: cantrips vs spells separati su hero row.
- Level-up API/UI hooks (TV + companion) oltre al builder.

**Criteri accettazione:**
- Test: per ogni classe, simulazione level 1→20 con scelte default non crasha e `maxHp`/slots coerenti.
- Checklist “Multiclass” e “Progressione” = ☑.

---

### Fase 9 — Esecuzione feature classi base (12 classi, L1–20)

**Obiettivo:** ogni riga tabella classe in `coverage.ts` = `runs` | `progression` | `no_combat` giustificato.

**Task:**
- Per ciascuna delle 12 classi: implementare risorse (Rage, Ki, Channel, Bardic, Sorcery points, ecc.) da colonne `classes.json`.
- Rimuovere il blocco “other 8 classes partial” in `coverage.ts`.
- `classLevelCap` = 20 per tutte le classi SRD abilitate.

**Criteri accettazione:**
- Report Fase 1: 12/12 classi al 100% feature verdi su 20 livelli.
- Almeno un test combattimento per classe a L1 e L5.

---

### Fase 10 — Sottoclassi SRD (12, L1–20)

**Obiettivo:** ogni sottoclasse enabled esegue le feature per livello.

**Task:**
- `subclassFeaturesAt` / `class-kit` per tutte le 12 sottoclassi importate.
- Coverage matrix per `subclass` id.

**Criteri accettazione:**
- 12/12 sottoclassi in checklist; nessun `missing` su feature di livello ≤ cap classe.

---

### Fase 11 — Feat SRD (tutti) eseguibili

**Obiettivo:** ogni feat enabled applica effetti in derive e/o combattimento.

**Task:**
- Mappa feat id → `grant_spell`, `grant_feature`, modificatori attacco/save/skill, Magic Initiate branches, Alert (init), Savage Attacker, ecc.
- Origin feat a L1 da background/specie nel builder; general/epic a level-up.

**Criteri accettazione:**
- Checklist feat 17/17; test per ogni feat enabled in fixture catalog.

---

### Fase 12 — Specie, background, equipaggiamento, weapon mastery

**Obiettivo:** grants origine + item completi; mastery pick e swap long rest.

**Task:**
- Applicare specie (speed, size, darkvision, resist, lineage, Human skill/feat/inspiration, Dwarf HP, …).
- Background: skill, tool, feat, ASI, equip → stash.
- Tutti gli item gear/magic: effects typed, attunement, charges, weapon lines su scheda.
- Weapon mastery: N pick da tabella classe; swap dopo long rest; `masteries` su hero.

**Criteri accettazione:**
- Checklist species/background/item/weapon-mastery = ☑.
- Derive mostra attacchi per ogni arma equipaggiata (requisito Roll20 fix).

---

### Fase 13 — Mostri SRD (235) in combattimento

**Obiettivo:** ogni mostro enabled compilato in `srd-monsters` e usabile in arena/PvE.

**Task:**
- Chiudere gap `srd-monsters.ts` / `parse-monsters` per azioni, recharge, legendary, spellcasting mostro.
- Legare admin enable a roster arena.

**Criteri accettazione:**
- Checklist monsters 235/235 executable; test compile per campione A–Z.

---

### Fase 14 — Persistenza hero + commit builder + stash

**Obiettivo:** `commitBuilderDraft` = preview + istanze stash; hero row completa per Fasi 6–12.

**Task:**
- Colonne JSON/SQL per tutti i campi spell, feat, mastery, tools, meta builder.
- Player L1 only; admin bypass.

**Criteri accettazione:**
- Parity preview/commit; stash contiene equip A/B + background.

---

### Fase 15 — Migrazione `custom_*` → `hero_*`

**Obiettivo:** decisione owner #1.

**Task:**
- `migrate-legacy-chargen.ts`, mapping 5.1→5.2.1, report lossy fields.
- Flag `FIREVERSE_MIGRATE_CUSTOM=1`; rimuovere `custom_*` da API pubbliche post-migrazione.

**Criteri accettazione:**
- 100% account con custom mappati o elencati in report falliti.

---

### Fase 16 — UI builder `/forge` + D-pad (TV/sito)

**Obiettivo:** wizard completo; rimuovere Forge 5.1 **nello stesso release** (Fase 17).

**Task:**
- Modulo condiviso: step Roll20-like; preview debounced; unfinishedSteps.
- Tre metodi punteggi; ASI background; feat step; prepared obbligatori; equip; About opzionale.
- Parità D-pad.

**Criteri accettazione:**
- E2E: Fighter + Wizard L1 player; scheda con attacchi e preparati.

---

### Fase 17 — Companion PWA + level-up armory L1–20

**Obiettivo:** companion senza QR da loggato; gestione PG e scelte pendenti a qualsiasi livello.

**Task:**
- Ridisegno PWA; forge + armory + level-up (`pending` da Fase 8).
- Lista `hero_*`; sheet da derive.

**Criteri accettazione:**
- Loggato: zero UI QR; level-up risolve tutti i `PendingAsk` con stesso motore server.

---

### Fase 18 — Scheda library + combattimento allineati a derive

**Obiettivo:** `heroPregen`, `buildPcSheet`, `librarySheet` per `hero_*` usano **solo** derive + stato combattimento.

**Task:**
- API sheet `hero_*`; estendere `pcSheetHtml` con mod skill, passive, attacks, resources L1–20.

**Criteri accettazione:**
- Sheet in tavolo = derive a parità di HP/slot spesi.

---

### Fase 19 — Release: rimozione Forge 5.1

**Obiettivo:** decisione owner #14.

**Task:**
- Rimuovere `/api/chargen`, `chargen-ui.ts`, `srd51.json` runtime, pocket forge, test legacy.
- README/docs aggiornati; friction log.

**Criteri accettazione:**
- CI verde; nessun riferimento runtime a 5.1; migrazione eseguita.

---

### Fase 20 — Gate finale completezza

**Obiettivo:** verifica **100%** prima di dichiarare il motore “SRD complete”.

**Task:**
- `npm run coverage:report` = 0 gap su contenuto enabled in ambiente staging.
- Passata manuale checklist matrice (tutte ☑).
- Aggiornare `docs/PRODUCT_V2.md` con stato completezza.

**Criteri accettazione:**
- Tutte le righe checklist ☑; report allegato al tag release.

---

## Parte C — PG Builder (flusso UX)

**Regola player:** solo **L1** alla creazione. **Regola motore:** supporto **L1–20** ovunque altrove.

Step: `Classe → Specie → Background → Abilità → Feat → Skill → Incantesimi → Equipaggiamento → About (opz.) → Review`

Panel scheda live: tutti i campi `DerivedSheet` (inclusi attacchi arma e preparati/spells known).

---

## Parte D — Mappa file

| Area | Percorso |
|------|----------|
| Derive / rules | `packages/rules/src/` (`derive-hero.ts`, `progression.ts`, `conditions.ts`, `mastery.ts`) |
| Hero / builder API | `backend/src/local/hero.ts`, `builder-http.ts`, `v2-http.ts` |
| Combat | `backend/src/local/combat.ts`, `srd-sheet.ts`, `srd-monsters.ts` |
| Content | `content/srd-5.2.1/`, `content-catalog.ts`, `tools/srd-parser/` |
| Coverage | `backend/src/local/coverage.ts`, `tools/coverage-report.ts` |
| Sheet UI | `packages/protocol/src/sheet.ts`, `builder.ts` |
| Builder UI | `tv/src/forge-v2.ts`, `companion/src/` |
| Legacy (remove Fase 19) | `chargen.ts`, `chargen-ui.ts`, `srd51.json` |

---

## Parte E — Brief Cursor

```text
Implementa la Fase N di docs/PG_BUILDER_V2_PLAN.md.
Obiettivo: completezza SRD 5.2.1 L1–20 (100% checklist). Nessun defer.
Rispetta le decisioni owner in tabella. English per UI e codice.
Aggiorna la checklist in questo file nel PR.
```

---

## Parte F — Rischi e mitigazioni (non sono tagli di scope)

| Rischio | Mitigazione |
|---------|-------------|
| Volume 339 spell / 235 mostri | Pipeline generazione abilities + test a campione per lettera; abilitazione graduale in admin **senza** abbassare il target 100% per ciò che è enabled |
| `notModeled` storico | Fase 2: ogni voce diventa typed effect o mechanicalSummary + issue |
| Migrazione 5.1→5.2.1 lossy | Report utente + mapping documentato |
| Legal PHB | Solo mechanicalSummary; review PR se tocca testo player-facing |
