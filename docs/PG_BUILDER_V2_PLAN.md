# Piano prodotto: PG Builder V2 + motore SRD 5.2.1 completo (L1–20)

Documento di riferimento per implementazione e **brief Cursor**.  
Organizzato in **CHECKPOINT** (fette verticali giocabili).  
**Ultimo aggiornamento:** 2026-10-15 (checkpoint verticali).

---

## Obiettivo esplicito (north star)

**Completezza di gioco end-to-end dal livello 1 al 20** su tutto il perimetro **SRD 5.2.1** importato nel repo, con un **motore regole unico** che esegue ogni meccanica necessaria a campagna, arena, progressione e combattimento.

| Ambito | Target |
|--------|--------|
| Contenuto SRD 5.2.1 abilitato in admin | **100%** delle righe catalogo **eseguibili** |
| Classi + sottoclassi SRD | **12 + 12**, livelli **1–20**, `coverage.ts` = `runs` dove applicabile |
| Regole core 2024 (checklist PHB) | Implementate; gap SRD → **PHB 2024** solo come riferimento meccanico → `mechanicalSummary` nostro (**mai** testo PHB in repo) |
| PG Builder V2 | Creazione **L1** per i player; derive **ricalcolata da zero**; il motore **non** è limitato a L1 |

**Riferimenti di lavoro (allegati):** `phb2024-mechanics.md`, `roll20-builder-notes.md`.

**Flusso di merge:** ogni checkpoint termina con PR → **il owner decide il merge su `main`** → verifica su **produzione** → si apre il checkpoint successivo. Il gioco resta **sempre in uno stato funzionante e rilasciabile** dopo ogni checkpoint.

---

## Decisioni owner (vincolanti)

| # | Decisione | Nota |
|---|-----------|------|
| 1 | `custom_*` → `hero_*` conversione automatica | Checkpoint **CK-12** |
| 2 | Builder su sito (`/forge`) **e** companion PWA; loggato = solo dati utente, **no QR** | CK-1 sito; CK-5 companion |
| 3 | Player: creazione **L1**; admin: qualsiasi livello | Motore L1–20 |
| 4 | Builder solo contenuto **enabled** in admin | Tutti i CK |
| 5 | Standard array + point buy + roll nel builder al rilascio finale | CK-4 |
| 6 | Background ASI +2/+1 o +1/+1/+1 | CK-4 |
| 7 | Numeri/regole: SRD; se insufficiente → PHB meccanico in codice/summary | Trasversale |
| 8 | Preparati: scelta **obbligatoria** | CK-3+ |
| 9 | Equip iniziale → **stash** al commit | CK-1+ |
| 10 | Lingue / About opzionali | CK-4+ |
| 11 | No multiclass a creazione L1 (player) | CK-1+ |
| 12 | Parità D-pad Fire TV al rilascio builder | CK-11 |
| 13 | Testi: SRD verbatim dove c’è; altrimenti summary nostro | Trasversale |
| 14 | Rimozione Forge 5.1 **stesso release** del builder a parità | **CK-11** (non prima) |

---

## Principi tecnici

1. **Server authoritative** — preview/commit/combat/level-up condividono `packages/rules`.
2. **Ricalcolo totale** del draft a ogni preview (anti-Roll20 stale).
3. **English** UI/codice; doc in italiano.
4. **Checkpoint = fetta verticale:** UI + API + derive + (se serve) combattimento/scheda **per quel perimetro**, verificabile dal owner senza checkpoint futuri.

---

## Deploy e verifica produzione (solo owner)

> **Gli agenti non eseguono deploy in produzione.** Il deploy avviene **solo** quando il owner lo chiede esplicitamente.

### Accesso

- Da PowerShell: `ssh fireverse` (host configurato dal owner).

### Prima di ogni deploy con migrazione DB o cambio formato dati

1. **Backup `accounts.sqlite`:** copia da `FIREVERSE_DATA_DIR` (default sul server: directory dati del processo Node, tipicamente `backend/data/` o path in `.env`) → file datato es. `accounts-YYYYMMDD-HHMM.sqlite.bak`.
2. **Backup `DATA_DIR` intero** (opzionale ma consigliato): `tar czf fireverse-data-YYYYMMDD.tar.gz <DATA_DIR>` (include `custom-characters/`, saves stanze, narration cache se presente).
3. Annotare **commit SHA** e **checkpoint** nel messaggio di deploy.

### Deploy applicazione (schema tipico — adattare allo script reale del server)

1. `git fetch && git checkout main && git pull` nella directory del repo sul server.
2. `npm ci && npm run typecheck && NARRATION=off npm test && npm run build`.
3. Se il checkpoint introduce migrazione: eseguire flag/script documentato nel checkpoint (es. `FIREVERSE_MIGRATE_CUSTOM=1` una tantum) **dopo** backup.
4. **Riavvio processo Node** che serve `https://d20fireverse.it/` (systemd/pm2/screen — usare il comando già in uso sul server).
5. **Health check:**
   - `curl -sS -o /dev/null -w "%{http_code}" https://www.d20fireverse.it/` → `200`
   - `curl -sS https://www.d20fireverse.it/api/table-info` → JSON con `publicUrl`
   - Login test account → `GET /api/me` → 200

### Rollback applicazione

1. Ripristinare commit precedente (`git checkout <sha>` + rebuild) **oppure** redeploy artefatto precedente.
2. Se migrazione DB ha corrotto dati: ripristinare `accounts.sqlite` dal backup e riavviare Node.
3. Verificare di nuovo health check + script manuale del checkpoint precedente.

Ogni checkpoint sotto include **Rollback** specifico oltre a questa procedura generale.

### Template sezioni (ogni CK)

Ogni checkpoint usa le stesse etichette: **Obiettivo** · **Cosa vede/fa il owner** · **Scope** · **Dati/migrazione** · **Test automatici** · **Script manuale — produzione** · **Script manuale — locale** (se diverso) · **Risultato atteso** · **Rollback** · **Definition of Done**. Dopo merge su `main`, il owner esegue lo script su prod prima del CK successivo.

---

## Matrice di coverage → checkpoint

Aggiornare ☐ → ☑ nel PR che chiude il checkpoint indicato.

### Contenuto catalogo

| Kind | Target | CK |
|------|--------|-----|
| species (9) | 9/9 grants + builder | CK-4, CK-9 |
| background (4) | 4/4 | CK-4, CK-9 |
| class (12) L1–20 | 12/12 | CK-7, CK-8, CK-9 |
| subclass (12) L1–20 | 12/12 | CK-10 |
| feat (17) | 17/17 | CK-10 |
| spell (339) | 339/339 | CK-3, CK-6, CK-9 |
| item gear | starter + equip | CK-2, CK-9 |
| item magic | tutti enabled | CK-11 |
| monster (235) | 235/235 | CK-13 |
| weapon-mastery (8) | 8/8 + pick/swap | CK-11 |

### Motore regole

| Area | CK |
|------|-----|
| Derive + sheet (skill mod, passive, attacks) | CK-1 ☑, CK-2 ☑ |
| D20 / skill / expertise / tool / passive | CK-6 |
| Heroic Inspiration | CK-6, CK-9 |
| 12 azioni standard | CK-7 |
| PF temp, death, exhaustion, rests | CK-6 |
| 15 condizioni + concentration | CK-7 |
| Spellbook / prepared | CK-3 |
| Ritual / upcast / pact (spell system 100%) | CK-11 |
| Multiclass + progressione L1–20 | CK-8, CK-9–10 |
| Weapon mastery storage + swap | CK-11 |
| Coverage report CI (`coverage:report`) | CK-0 |

---

## CK-0 — Strumenti di misura (opzionale ma consigliato prima di CK-1)

**Obiettivo:** report oggettivo del gap; **non** cambia il gioco per il player.

**Cosa vede/fa il owner:** nulla in UI; opzionalmente esegue in locale `npm run coverage:report` e legge elenco gap.

**Scope:** `tools/coverage-report.ts`, estensione `coverage.ts` a 12 classi × 20 livelli (solo report), `docs/COVERAGE_PROGRESS.md`.

**Dati/migrazione:** nessuna.

**Test automatici:** script esce 0 se baseline invariata; snapshot report in CI opzionale.

**Script manuale (locale):** `npm run coverage:report` → file/lista feature `missing`.

**Risultato atteso:** report leggibile; gioco identico a prima.

**Rollback:** revert commit.

**Definition of Done:** comando documentato in README dev; nessuna regressione CI.

**Merge:** owner può saltare CK-0 e fondere strumenti in CK-1 se preferisce una sola PR iniziale.

---

## CK-1 — Fetta verticale: “Primo eroe” (Fighter L1 end-to-end)

**Obiettivo:** un giocatore crea un **Fighter L1** con il **nuovo flusso** (`/forge`), ottiene `hero_*`, vede lo eroe in lista, equipaggiamento nello **stash**; il **Forge 5.1 resta** (stato shippable doppio percorso).

**Cosa vede/fa il owner (prod):**

- Login su https://www.d20fireverse.it/
- Apre `/forge` (o entry point documentato in PR)
- Sceglie **Fighter**, **Human**, **Soldier**, standard array, 2 skill classe, fighting style, equip opzione A
- Review: scheda live con HP/CA coerenti
- Crea → nuovo eroe in elenco PG
- In admin: verifica riga in DB / stash con oggetti classe+background

**Scope (indicativo):**

- `packages/rules/src/derive-hero.ts` (perimetro: 1 classe, 1 specie, 1 background)
- `packages/protocol/src/builder.ts`
- `backend/src/local/builder-http.ts` — `GET /api/builder/catalog`, `POST /api/builder/preview`, `POST /api/builder/commit`
- `tv/src/forge-v2.ts` + route `/forge` + **D-pad base** per questo perimetro
- `hero.ts` — commit draft L1 player; stash istanze
- Admin: abilitare in Content `fighter`, `human`, `soldier`, item starter necessari

**Dati/migrazione:** nuove colonne JSON hero se necessarie; migrazione SQLite **additiva** (nuove colonne nullable); backup prima deploy.

**Test automatici:**

- Unit derive: Fighter L1 HP/CA/skill mods not empty
- API: preview → commit → `hero_*` exists; stash length ≥ 1
- CI esistente verde

**Script manuale — produzione (`https://www.d20fireverse.it/`):**

1. Login (Amazon o test).
2. Vai a `/forge`.
3. Completa wizard Fighter/Human/Soldier; osserva che cambiando una skill la scheda laterale **cambia** (no trait fantasma).
4. Submit → messaggio successo.
5. Lobby/titolo o `/api/heroes` (se esposto in UI): compare nuovo eroe `hero_…`.
6. **Non** usare ancora “Forge a new hero” 5.1 sulla TV se ancora presente — opzionale confronto.

**Script manuale — locale:**

1. `npm run build && npm run dev:backend` (+ `dev:tv` se serve).
2. Stessi passi su `http://127.0.0.1:3100/forge` o porta TV.

**Risultato atteso:** `hero_*` creato; stash popolato; preview = scheda review; player non può scegliere livello ≠ 1.

**Rollback:** revert deploy; restore DB se commit ha scritto colonne incompatibili; Forge 5.1 ancora funzionante.

**Definition of Done:** test automatici verdi; owner firma script manuale prod; checklist derive/sheet CK-1 ☑; **nessuna** rimozione Forge 5.1.

---

## CK-2 — Scheda library `hero_*` + equip + righe attacco

**Obiettivo:** dopo CK-1, il owner **apre la scheda** del PG V2 (sito/companion/TV) e vede **modificatori skill**, **passive**, **attacchi** derivati dall’arma in stash dopo equip.

**Cosa vede/fa il owner:**

- Seleziona `hero_*` creato in CK-1
- Equip arma dallo stash (UI armory o API se UI non pronta — PR deve indicare dove)
- Scheda mostra longsword (o pack fighter) con bonus attacco/danno coerenti

**Scope:** `hero-pregen.ts` delega a derive; `librarySheet` / `GET /api/heroes/:id/sheet`; `protocol/sheet.ts` (skill mod, passive, attacks); equip `hero.ts`.

**Dati/migrazione:** nessuna breaking.

**Test automatici:** integration equip → sheet attacks change; parity derive vs sheet.

**Script manuale — produzione (`https://www.d20fireverse.it/`):**

1. Eroe CK-1 → armory → equip item stash.
2. Apri scheda → verifica AC se armatura equip; attacco non “vuoto”.
3. Dis-equip → attacco torna unarmed o ridotto.

**Script manuale — locale:** stessi passi su dev TV/sito con eroe creato in CK-1.

**Risultato atteso:** scheda allineata a `derive-hero`; attacchi coerenti con equip; nessun `custom_*` richiesto.

**Rollback:** revert deploy; hero row invariata se solo lettura rotta.

**Definition of Done:** test automatici verdi; owner firma script prod; matrice item gear (starter) ☑.

---

## CK-3 — Fetta verticale: Wizard L1 (spellbook + preparati obbligatori)

**Obiettivo:** percorso **caster** completo a creazione: 6 spellbook / 4 prepared / 3 cantrip (numeri PHB 2024 se SRD silente); **almeno un incantesimo** lanciabile in combattimento arena con quell’eroe.

**Cosa vede/fa il owner:**

- `/forge` → Wizard + Sage (o combo abilitata)
- Step spell: sceglie esattamente 4 prepared da spellbook; submit bloccato se count errato
- Porta eroe in **arena** (o combattimento test), lancia un cantrip o spell L1, slot decrementa su scheda

**Scope:** derive spell; builder step spells; `combat.ts` + abilities per spell wizard enabled; content admin enable wizard + spell subset poi espanso.

**Dati:** `spellbook_json`, `spells_prepared_json`, `cantrips_json` su hero.

**Test automatici:** wizard L1 derive counts; combat spend slot; builder validation NEED_SPELLS.

**Script manuale — produzione:**

1. Abilita in admin wizard + ≥6 spell L1 + cantrip.
2. Crea Wizard via `/forge`; conferma 4 prepared.
3. Arena con quell’eroe; cast; verifica slot su TV/companion.

**Script manuale — locale:** stessi passi con admin locale + arena dev.

**Risultato atteso:** 4 prepared obbligatori; slot/cantrip su scheda; almeno un cast in combattimento con log server coerente.

**Rollback:** revert deploy; eliminare eroi wizard test da admin se dati spell invalidi.

**Definition of Done:** owner firma cast in prod; matrice spell (percorso wizard L1) ☑.

---

## CK-4 — Builder L1 completo (tutti i metodi punteggi + tutte le origini enabled)

**Obiettivo:** allargare `/forge` a **tutto il catalogo abilitato** in admin: 9 specie, 4 background, 12 classi (creazione L1), standard array **+ point buy + roll**, ASI background +2/+1 e +1/+1/+1, step feat (origin + fighting style), About opzionale.

**Cosa vede/fa il owner:** crea un PG per ogni classe abilitata; roll server-side; PB 27; validazione ASI; Forge 5.1 ancora presente.

**Scope:** builder UI tutti step; `POST /api/builder/roll`; content schema grants specie/background (CK-4 può includere Fase dati minima per tutte le origini); derive allargato.

**Dati:** `builder_meta_json` (method, asi mode).

**Test:** matrix parametrizzata per ogni species×class enabled (smoke); point buy over budget fails.

**Script manuale — produzione:** per 2 classi (martial + caster): PB, roll, ASI +1/+1/+1 con stessa ability → errore; crea un PG per ogni specie/background enabled.

**Script manuale — locale:** stesso campione su `/forge` locale.

**Risultato atteso:** solo contenuto enabled; tre metodi punteggi; About skippabile; Forge 5.1 ancora disponibile.

**Rollback:** revert; disabilitare in admin classi non ancora coperte da CK-9–10.

**Definition of Done:** decisioni owner #5–6–10; species 9/9 e background 4/4 in builder ☑; owner firma prod.

---

## CK-5 — Companion PWA (loggato senza QR) + forge

**Obiettivo:** stesso builder su **https://www.d20fireverse.it/companion/**; utente loggato **non vede** scanner QR; vede eroi + forge + armory.

**Cosa vede/fa il owner:** login companion → nessuna UI camera; forge crea `hero_*`; pairing QR solo quando flusso “a tavolo” attivo (documentare comportamento esatto in PR).

**Scope:** `companion/src/` redesign; modulo forge condiviso con TV; `pocket.ts` senza QR in home loggata.

**Dati:** nessuna.

**Test:** smoke companion build; test login mock senza QR element.

**Script manuale — produzione:** telefono → `https://www.d20fireverse.it/companion/` → login → conferma assenza QR in home loggata; crea eroe via forge; apri scheda.

**Script manuale — locale:** companion dev con stesso account.

**Risultato atteso:** parità funzionale con `/forge` sito per perimetro CK-4; QR solo in flusso pairing documentato.

**Rollback:** revert bundle companion; sito TV `/forge` invariato.

**Definition of Done:** decisione #2 companion ☑; owner firma su device reale in prod.

---

## CK-6 — Regole core giocabili (morte, PF temp, exhaustion, riposi, passive, expertise)

**Obiettivo:** in **combattimento o story** con `hero_*`, il owner verifica meccaniche Ch.1 senza aspettare tutte le classi.

**Cosa vede/fa il owner:** arena; riduce PG a 0 → death saves; PF temp da item/spell se presente; exhaustion da effetto test (o item); short rest recupera HD; passive Perception su scheda = 10 + mod.

**Scope:** `combat.ts` temp HP, death saves completo, exhaustion; `srd-sheet.ts` rests; `coop.ts` expertise/passive; derive aggiornato (condizioni complete in **CK-7**).

**Dati:** nessuna breaking.

**Test automatici:** unit death/exhaustion/temp HP; integration short rest HD.

**Script manuale — produzione:** combattimento (arena); checklist “Danno/guarigione”, “Rests”, “D20 passive”.

**Script manuale — locale:** stessi scenari su arena dev.

**Risultato atteso:** death saves a 0 HP; temp HP non cura “vero”; exhaustion modifica roll dove previsto; passive Perception = 10 + mod su scheda.

**Rollback:** revert; combattimento torna a comportamento CK-5.

**Definition of Done:** owner firma 3 scenari in prod; matrice righe core Ch.1 ☑ (escluso elenco 15 condizioni → CK-7).

---

## CK-7 — Condizioni complete + azioni standard mancanti

**Obiettivo:** 15 condizioni applicate; azioni Influence/Study/Utilize/Ready dove previsto; unarmed 2024 base; copertura OA/TWF migliorata.

**Cosa vede/fa il owner:** in combattimento, applica prone/frightened e vede advantage; usa Dash/Dodge; prova unarmed.

**Scope:** `combat.ts`, menu azioni, `coverage.ts` aggiornato.

**Test automatici:** tabella condizioni; test OA; concentration break on damage.

**Script manuale — produzione:** prone + ranged; Help → advantage ally; frightened disadvantage.

**Script manuale — locale:** arena dev, stessi scenari.

**Risultato atteso:** 15 condizioni con effetti meccanici visibili in combattimento/scheda.

**Rollback:** revert; CK-6 core ancora valido.

**Definition of Done:** matrice condizioni 15/15 ☑; owner firma prod.

---

## CK-8 — Progressione L2–20 + multiclass (motore) + level-up UI

**Obiettivo:** XP/level-up fino a 20; multiclass da L2; **UI** level-up su TV/companion; admin crea PG alto livello; player resta L1 solo a **creazione**.

**Cosa vede/fa il owner:** vince arena o admin grant XP → level-up → sceglie ASI/spell/subclass; multiclass opzionale L2+; scheda e combattimento riflettono livello.

**Scope:** `progression.ts`, `applyPick`, `hero.ts` fix cantrips/spells split; UI level-up; arena XP.

**Dati:** migrazione hero row se serve; backup DB.

**Test automatici:** simulazione 1→20 fighter; multiclass prereq fail/success.

**Script manuale — produzione:** admin grant XP; level-up wizard a L3 subclass se enabled; verifica slot; multiclass L2+ su eroe test.

**Script manuale — locale:** progression dev tools se esposti.

**Risultato atteso:** player non può creare L>1; level-up persiste su `hero_*`; combattimento usa livello aggiornato.

**Rollback:** restore DB da backup se migrazione hero fallisce; revert altrimenti.

**Definition of Done:** checklist Multiclass + Progressione ☑; owner L3+ su eroe test in prod.

---

## CK-9 — Pack classi A (Barbarian, Fighter, Rogue, Wizard) L1–20 eseguibili

**Obiettivo:** **quattro classi** complete in combattimento + level-up + derive; builder già le supporta da CK-4.

**Cosa vede/fa il owner:** per ciascuna classe, eroe L1→5 (minimo) in arena; usa Rage, Sneak, Second Wind, slot wizard; `coverage:report` 4/12 verde.

**Scope:** `coverage.ts`, `class-kit.ts`, `combat.ts` per feature mancanti; content enabled.

**Test automatici:** per-class combat test L1 e L5; `coverage.ts` `runs` per feature pack A.

**Script manuale — produzione:** 4 smoke (Barb/Fighter/Rogue/Wizard) documentati in PR — creazione L1, fight, level-up a ≥5.

**Risultato atteso:** `npm run coverage:report` segnala 4/12 classi complete; nessuna feature “placeholder” per queste 4.

**Rollback:** revert; disabilitare classi pack A in admin se necessario.

**Definition of Done:** 4 classi ☑ in matrice; cap 20 in code; owner firma 4 smoke prod.

---

## CK-10 — Pack classi B + C (8 classi rimanenti) + 12 sottoclassi + 17 feat

**Obiettivo:** restanti 8 classi L1–20; ogni sottoclasse SRD; ogni feat enabled eseguibile in derive/combat.

**Cosa vede/fa il owner:** level-up subclass; feat Alert/Magic Initiate ecc. cambiano scheda/comportamento; report 12/12 classi.

**Scope:** combat + feat engine + subclass features.

**Test automatici:** feat matrix; subclass level 3 pick; coverage 12/12 classi.

**Script manuale — produzione:** campione: un eroe per sottoclasse abilitata + 2 feat rappresentativi.

**Risultato atteso:** report 12/12 classi; ogni feat enabled modifica derive o combattimento.

**Rollback:** revert; ridurre enable set in admin.

**Definition of Done:** class 12/12, subclass 12/12, feat 17/17 ☑; owner firma campione prod.

---

## CK-11 — Item/magic/mastery + spell system 100% + D-pad builder completo

**Obiettivo:** tutti gli item enabled con effects; weapon mastery pick + swap long rest; ritual/upcast/pact completi; **parità D-pad** su tutti gli step `/forge`; **rimozione Forge 5.1** nello **stesso deploy** di questo checkpoint (decisione #14).

**Cosa vede/fa il owner:**

- Builder D-pad-only su Fire TV per intero flusso
- **Non** esiste più “Forge 5.1” / `/api/chargen`
- Mastery swap dopo long rest
- Ritual cast fuori combattimento (o stub UI documentato)

**Scope:** rimuovere `chargen-ui.ts`, `/api/chargen`, `srd51.json` runtime, pocket forge 5.1; `mastery` storage; spell ritual pipeline.

**Dati:** nessuna migrazione player se CK-12 non ancora eseguito.

**Test:** grep repo no `/api/chargen`; CI senza chargen.test; full spell enabled smoke.

**Script manuale prod:**

1. TV: titolo → solo entry “Create hero” V2 (no 5.1).
2. D-pad: crea PG completo.
3. `curl` `/api/chargen` → 404.
4. Ritual: [passi definiti in PR].

**Rollback:** **critico** — redeploy commit precedente **e** ripristino bundle TV; riabilitare endpoint chargen solo in emergenza (branch hotfix).

**DoD:** decisioni #12 e #14 ☑; owner firma TV + web; checklist spell/item/mastery ☑.

---

## CK-12 — Migrazione `custom_*` → `hero_*`

**Obiettivo:** conversione automatica; nessun `custom_*` in API pubbliche.

**Cosa vede/fa il owner:** dopo deploy one-shot migrazione, account con vecchi PG vedono `hero_*` equivalenti; report admin migrati/falliti.

**Scope:** `migrate-legacy-chargen.ts`, flag avvio, rimozione file `custom-characters` dal path attivo.

**Dati:** **backup obbligatorio** `accounts.sqlite` + `custom-characters/` prima migrazione.

**Test:** fixture custom JSON → hero row.

**Script manuale prod:**

1. Backup (owner).
2. Deploy con `FIREVERSE_MIGRATE_CUSTOM=1` (o comando documentato).
3. Login account test con custom → lista solo `hero_*`.
4. Leggi report migrazione.

**Rollback:** restore DB + directory custom da backup; redeploy versione pre-migrazione.

**DoD:** decisione #1 ☑; zero `custom_*` in `/api/pregens`.

---

## CK-13 — Mostri SRD (235) in arena/PvE

**Obiettivo:** ogni mostro enabled compilato e selezionabile/roster.

**Cosa vede/fa il owner:** admin enable mostro → arena PvE con quel mostro; azioni e save funzionano.

**Scope:** `srd-monsters.ts`, parser, admin enable.

**Test automatici:** compile sample per lettera A–M, N–Z; stat block → combat entity.

**Script manuale — produzione:** admin enable 3 mostri → 3 fight arena/PvE.

**Script manuale — locale:** stesso con catalogo dev.

**Risultato atteso:** azioni mostro, save e HP coerenti con SRD enabled.

**Rollback:** revert; disabilitare mostri nuovi in admin.

**Definition of Done:** monster 235/235 ☑ per id enabled; owner firma 3 fight prod.

---

## CK-14 — Gate finale 100% + documentazione release

**Obiettivo:** `coverage:report` zero gap su contenuto enabled in staging; tutte ☑ matrice; `PRODUCT_V2` aggiornato.

**Cosa vede/fa il owner:** esegue report + script regressione completa CK-1→CK-13; tag release.

**Scope:** docs, friction log, eventuali fix gap residui **solo** se report non zero.

**Test automatici:** CI + `coverage:report` gate zero gap su enabled set.

**Script manuale — produzione:** regressione campione CK-1, CK-3, CK-5, CK-11, CK-12 su prod; checklist allegata al tag.

**Risultato atteso:** north star L1–20 + builder + migrazione verificata; `PRODUCT_V2` allineato.

**Rollback:** non applicabile (tag); hotfix su branch dedicato.

**Definition of Done:** owner sign-off esplicito; tutte le ☑ matrice per contenuto enabled.

---

## Flusso PG Builder (UX)

Step: `Classe → Specie → Background → Abilità → Feat → Skill → Incantesimi → Equipaggiamento → About (opz.) → Review`

Panel scheda: output `DerivedSheet` sempre da preview server.

---

## Mappa file (riferimento)

| Area | Percorso |
|------|----------|
| Derive | `packages/rules/src/derive-hero.ts`, `progression.ts`, `conditions.ts` |
| Builder API | `backend/src/local/builder-http.ts`, `hero.ts` |
| UI forge | `tv/src/forge-v2.ts`, `companion/src/` |
| Combat / sheet | `combat.ts`, `hero-pregen.ts`, `protocol/sheet.ts` |
| Content | `content/srd-5.2.1/`, `content-catalog.ts` |
| Legacy (rimosso CK-11) | `chargen.ts`, `chargen-ui.ts`, `srd51.json` |

---

## Brief Cursor

```text
Implementa il checkpoint CK-N di docs/PG_BUILDER_V2_PLAN.md.
Fetta verticale: deve essere verificabile dal owner con lo script manuale del checkpoint,
senza dipendere da checkpoint futuri. Aggiorna la matrice coverage nel PR.
English per UI e codice. Non fare deploy in produzione.
```

**Ordine:** CK-0 (opz.) → **CK-1** → CK-2 → … → CK-14. Non saltare: ogni CK assume i precedenti merged e verificati dal owner su prod.

---

## Riepilogo checkpoint (lista)

| ID | Nome breve |
|----|------------|
| CK-0 | Strumenti coverage report (opz.) |
| CK-1 | Primo eroe Fighter L1 E2E `/forge` + stash (Forge 5.1 resta) |
| CK-2 | Scheda `hero_*` + equip + attacchi |
| CK-3 | Wizard L1 spellbook/preparati + cast in arena |
| CK-4 | Builder L1 completo (tutte origini + 3 metodi punteggi + ASI) |
| CK-5 | Companion PWA senza QR + forge |
| CK-6 | Regole core combattimento (death, temp HP, exhaustion, rests, passive) |
| CK-7 | 15 condizioni + azioni standard |
| CK-8 | Progressione L2–20 + multiclass + UI level-up |
| CK-9 | 4 classi L1–20 complete (Barbarian, Fighter, Rogue, Wizard) |
| CK-10 | 8 classi restanti + 12 sottoclassi + 17 feat |
| CK-11 | Item/magic/mastery + spell 100% + D-pad pieno + **rimozione Forge 5.1** |
| CK-12 | Migrazione `custom_*` → `hero_*` |
| CK-13 | Mostri SRD arena |
| CK-14 | Gate finale 100% |
