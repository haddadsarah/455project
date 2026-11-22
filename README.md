# CipherBreak EDU — The 16-Round Escape

*Learn the cipher. Break the challenge. Understand the weakness.*

An educational escape-room game that teaches DES (EECE 455, American University of Beirut).
Players escape a locked cryptography lab by solving four rooms, each built on real DES
calculations made by our own DES engine with full tracing.

> **DES is not secure.** It is used here only as a teaching tool. Its 56-bit effective key can be
> found by exhaustive search. Real systems should use current authenticated encryption (e.g. AES-GCM).

---

## Merged application

This repository runs one Django game with one authoritative DES engine. The public prototype supplied the cinematic facility artwork, typography and visual direction. The uploaded project supplied the accounts, game services, machinery, tutorials, DES trace engine, laboratory, classroom analytics and tests. The first-person room and overhead **View** toggle share the same player movement, server attempt, inventory, room locks and machines.

For an existing database from the previous repository edition, stop the server and back up `db.sqlite3`. Then run `python manage.py migrate` and `python manage.py import_legacy_progress`. The import is repeatable and leaves the original tables intact. It carries over users, coursework, attempt inputs, room completions, scores, badges and recorded performance. The machines now use the richer puzzle formats of the merged game. Progress from the departing browser-only preview stays in that browser and is not treated as authenticated classroom evidence.

The merged application runs locally. The old Sites URL is the archived browser prototype and cannot host this Django backend.

## 1. Run it locally (about 2 minutes)

Requires Python 3.10+.

```bash
cd CipherBreak-EDU
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo          # fictional demo accounts + classroom
python manage.py runserver
```

Open **http://127.0.0.1:8000/**.

### Demo accounts (local development only)

All demo accounts use the password **`cipherbreak-demo-2026`** (set `CIPHERBREAK_DEMO_PASSWORD`
before running `seed_demo` to choose another). The command and demo logins are disabled outside DEBUG mode.

| Username | Role | State |
|---|---|---|
| `prof_demo` | Instructor | Owns the classroom "EECE 455 — Demo Section" (join code `DEMO55`) |
| `student_demo` | Student | Fresh account, use it for the live demo |
| `student_ali` | Student | Completed in Guided mode, pre + post assessment |
| `student_maya` | Student | Completed in Challenge mode, pre + post assessment |
| `student_omar` | Student | In progress (Rooms 1–2 done), shows saved progress / Resume |
| `student_lea` | Student | Joined the class, not started |

Each demo account has a fictional email `<username>@example.com`, so you can try **Forgot your password?**.

### Password reset (local demo)

The sign-in page has **Forgot your password?**. For the local demo, Django's *console email backend* is
used: no real email is sent, and the reset email (with its link) is **printed in the terminal running
`runserver`**. Copy the link into the browser to choose a new password. Students who registered without
an email can't reset by email, but any signed-in user can use **Change my password** on the dashboard.
For a real deployment, set `DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`,
`DJANGO_EMAIL_HOST` and `DJANGO_DEFAULT_FROM_EMAIL`.

Instructor invitation code for testing instructor sign-up: **`AUB-EECE455-DEMO`** (5 uses).
The simulated students' data was produced by playing through the real game rules
(`game/autoplay.py`); it is fictional sample data, not real student results.

### Reset demo data

```bash
python manage.py seed_demo --reset   # delete ONLY demo accounts/classroom, then recreate
python manage.py seed_demo --remove  # delete demo data only
```
Only accounts flagged as demo (created by this command) are ever deleted. To wipe everything,
keep your existing database and run `python manage.py seed_demo --reset` to replace only the tagged local fixtures.

### Run the tests

```bash
python manage.py test        # 74 tests: DES engine, game rules, persistence, security, instructor tools
```
`pycryptodome` is used **only** in one test to cross-check our DES against an independent library.

Optional: `python manage.py createsuperuser` gives access to `/admin/` (e.g. to create new instructor invitation codes).

---

## 2. Suggested 15–20 minute demonstration

1. Landing page → "For Educators" (product/business pitch).
2. Sign in as `student_omar` → dashboard shows saved progress, badges, statistics → **Resume Adventure**.
3. Sign out, sign in as `student_demo` → **Start New Adventure (Guided)** → title screen → lockdown intro
   with NOVA → walk around the lobby (WASD/arrows or click) → mission briefing at the holotable.
4. Room 1 (Hex Gate): walk to each machine and press E — letter plates + hex dials (ASCII → hex),
   block inspector (bit switches), IP patch panel (patch a cable), laser splitter (L0/R0). The gate opens.
5. Room 2 (Key Vault): tag the parity bits, PC-1 patch panel, splitter (C0/D0), rotate the C/D rotor disks,
   PC-2, pull the forge lever to make K1…K16; the key archive terminal shows every key round.
6. Room 3 (Round Reactor): E sockets, XOR gate wiring, S-box grid, P patch panel, Feistel router,
   ignite the reactor core (all 16 rounds, round log with every operation).
7. Room 4: drag key cartridges into reverse order, the decryption engine, the exit keypad's letter wheels,
   NOVA's security questions → walk out of the exit → escape screen.
8. Results page (mastered vs needs-practice concepts).
9. Sign in as `prof_demo` → classroom analytics, pre/post comparison, CSV export.
10. Instructor → **Demonstration mode** (open any room with your own message/key) and the **DES Lab** lecture view.

Tip: to skip ahead during a live talk, use instructor demonstration mode to open Room 3 directly.

---

## 3. Features

**Game.** A 2D pixel-art escape room drawn on a canvas (all art is generated in code; no image files).
Title screen, lockdown intro, then you walk your character through a lobby and four themed rooms with
**WASD / arrow keys or click-to-walk** (on-screen pad on touch screens). NOVA is a floating drone that follows
you and talks in speech bubbles and a dialogue box. Walk up to a machine and press **E** (or click it) to use it.
Every challenge is an in-world machine operated with game mechanics: hex dials, letter plates, bit switches,
a patch cable for IP / PC-1 / PC-2 / P, a laser splitter, rotor disks, a key forge lever, E sockets, XOR gate
wiring, an S-box grid, a Feistel router, a reactor core, drag-and-drop key cartridges, letter wheels, and
NOVA's dialogue questions. Juicy feedback: "ACCESS GRANTED" stamp, sparks, screen shake, gate-opening
animation, item pickups, synthesized sound effects. HUD with score, escape progress, room locks and timer;
inventory of recovered items (code card, block, halves, key, 16 key chips, ciphertext tape, exit code);
archive terminals in Rooms 2–4 that show the full key schedule and every encryption/decryption round;
facility map (also opens any machine without walking, for keyboard/screen-reader users), pause menu
(Esc), escape screen and results. 4 rooms / 21 challenges (one optional bonus). Locked doors and machines
explain what to do first, and an amber marker always points to the next machine.

**Teaching.** NOVA's in-world onboarding teaches the controls by doing (move, then use the holotable),
and every room starts with a short NOVA briefing of the DES step it covers. Every challenge has its own interactive tutorial that explains, demonstrates,
requires an action (e.g. "rotate the C disk once") or a small practice question with checked feedback
before moving on (it highlights the real parts of the machine). Auto-starts in Guided mode, available on demand in Challenge mode. Three hint levels
(concept → similar example → walkthrough) that teach the method. Targeted mistake feedback
(e.g. "You rotated by 1; round 3 needs a shift of 2"). Learning Notebook with 14 pages.

**Scoring.** Up to 100 per challenge, −10 per wrong answer, hints −10/−20/−30 in Challenge mode
(free in Guided), +50 per room; never negative; awarded once; format errors cost nothing. Six achievements.
Optional timer display (no time limit). Server-side validation of everything.

**Replayability.** Each adventure gets a random seed → new message code, key (odd parity, no weak keys),
exit code, selected round, S-box groups, table positions, key-rotation round, decryption round and
shuffled options. In Room 4 the decryption keys are ordered by **drag-and-drop** onto the 16 round slots
(drag between slots to swap); clicking or pressing Enter on a key still places it in the next empty slot,
and clicking a filled slot sends its key back. Parameters are stored with the attempt, so refresh/resume never changes puzzles.
Recently used codes are avoided for the same student.

**Accounts & persistence.** Django authentication (hashed passwords, sessions, CSRF). Instructor role only
via invitation code. Progress saved after every action (room entry, puzzle open, submission, hint, tutorial).
Previous attempts are kept.

**DES Lab** (works without playing): any hex block/key, encrypt/decrypt, ASCII → hex helper, rounds 1–16 with
every operation, expandable S-box lookups, full key schedule, all DES tables, copy buttons, standard test
vectors, round animation replay, show/hide explanations, lecture view for instructors. If a student opens it
during an *independent* Challenge attempt, they are warned and that attempt is relabelled as practice.

**Instructor tools.** Classrooms with join codes, assignments (guided/challenge/any required), per-student
progress (rooms, score, accuracy per LO1–LO7, attempts, hints, time, pre/post), class analytics (enrolled,
started, completed, completion rate, averages, most-missed concepts, pre vs post by objective), CSV export,
demonstration mode. Instructors can **rename a classroom / regenerate its join code**, **delete a classroom**
(type its name to confirm), **remove a student** from a classroom and **delete assignments**; students keep
their own accounts and game history in every case. Instructors only see and manage their own classrooms.

**Sound & music.** Original background music generated live in the browser with the Web Audio API
(a slow ambient chord loop with a soft arpeggio; no audio files, nothing copyrighted). It is **off by
default**: turn it on with **♫ Music** on the title screen or the game's top bar or in Settings (with a volume slider). Sound
effects have their own **Sounds** toggle, also off by default. Choices are remembered in the browser.

**Accessibility.** Keyboard navigation, visible focus, ARIA labels/live regions, feedback in text not just
colour, reduced-motion (system setting + in-game toggle), larger-text option, responsive desktop/mobile.
Sound effects are original synthesized tones, muted by default.

---

## 4. Architecture

```
cipherbreak/        Django settings and URL routes
des_engine/         Pure-Python DES + tracing (no Django dependency)   ← algorithm
  tables.py         Standard FIPS 46-3 tables (IP, IP⁻¹, E, P, PC-1, PC-2, shifts, S1–S8)
  core.py           validation, key_schedule(), feistel(), des_trace(), encrypt(), decrypt()
  tests/            DES unit tests
game/               The game                                              ← game logic
  generator.py      seeded generation of a new adventure
  puzzles.py        the 21 challenges: view data, fields, answers (from des_engine), hints, feedback
  services.py       progression, scoring, hints, achievements, results (all server-side rules)
  assessments.py    pre/post question bank (one question per learning objective)
  notebook.py       Learning Notebook content
  autoplay.py       plays an attempt through the real rules (tests + demo data)
  models.py         Attempt, RoomProgress, PuzzleProgress, PuzzleSubmission, HintUsage,
                    UserAchievement, AssessmentResult
  views.py          pages + JSON API used by the game screen
  management/commands/seed_demo.py
  tests/            game, persistence, security, instructor tests
accounts/           Profile (role, notebook), InstructorInvite, TutorialCompletion, registration
classroom/          Classroom, Membership, Assignment; instructor dashboard, analytics, CSV, demo mode
lab/                DES Learning Laboratory page + /api/des/
templates/          HTML pages
static/css/app.css  visual theme, rooms, animations, responsive + reduced-motion rules
static/css/game.css game art direction: HUD, machines, title/escape screens
static/js/          world.js (canvas pixel-art engine: rooms, player, NOVA, doors, lighting, particles),
                    machines.js (the puzzle machines), play.js (game flow, HUD, NOVA, inventory, menus),
                    common.js (API, sound, settings), tutorial.js (overlay engine),
                    trace.js (round & key explorers), lab.js
```

The browser never receives an answer before the challenge is solved; it sends answers to
`/api/attempt/<id>/puzzle/<pid>/submit/` and displays the server's verdict.

### Suggested split for a four-person team
- **Algorithm & implementation:** `des_engine/`, `game/puzzles.py`, `game/services.py`.
- **UI & technical diagrams:** `templates/`, `static/css/`, `static/js/` (world in `world.js`, machines in `machines.js`, explorers in `trace.js`).
- **Testing & verification:** `des_engine/tests/`, `game/tests/`, manual browser checklist below.
- **Report & presentation:** this README, the Notebook content, the demo script in section 2.

---

## 5. How each DES operation is implemented (`des_engine/core.py`)

Bits are handled as strings of `'0'/'1'`, bit 1 = leftmost, exactly as numbered in the standard, so
every intermediate value can be shown to students as both hex and binary.

| Operation | Implementation |
|---|---|
| Input validation | `validate_hex64`: exactly 16 hex digits (spaces allowed), clear messages for missing / wrong length / non-hex; leading zeros preserved by zero-padded formatting |
| IP / IP⁻¹ / E / P / PC-1 / PC-2 | `permute(bits, table)`: `output[i] = input[table[i]]` with the standard 1-based tables |
| Key schedule | `key_schedule`: PC-1 → C0, D0 (28 bits each) → for rounds 1–16 rotate left by `SHIFTS[i]` → PC-2 on C‖D → 48-bit Kᵢ. Trace keeps PC-1, C0/D0, shift, running total, C/D before and after, C‖D and Kᵢ |
| S-boxes | `sbox_lookup`: row = bits 1&6, column = bits 2–5, value from S1–S8, output as 4 bits; trace keeps all of these |
| F-function | `feistel(R, K)`: E(R) → ⊕K → 8 S-boxes → P |
| Rounds | `des_trace`: IP → L0,R0 → 16 × (Lᵢ = Rᵢ₋₁, Rᵢ = Lᵢ₋₁ ⊕ F(Rᵢ₋₁, Kᵢ)) → swap R16‖L16 → IP⁻¹ |
| Decryption | same `des_trace` with `decrypt=True`: the same subkeys applied in order K16…K1 (no separate key set) |

Verification: the classic vector `0123456789ABCDEF` / `133457799BBCDFF1` → `85E813540F0AB405`,
all 16 published round keys for that key, published round-1 intermediates (E, XOR, S-box output, F, R1),
L16/R16, five more known-answer vectors, 200 random encrypt/decrypt round trips, and 300 random blocks
cross-checked against pycryptodome. Results are computed, never hard-coded.

---

## 6. Verification done

- `python manage.py test` — 74 tests pass.
- Automated browser runs (Chromium, Playwright) that play a complete adventure through the real game:
  title screen, intro, onboarding (moving, using the holotable), walking to every machine by clicking the
  world, operating each machine's controls (dials, switches, cables, cutter, rotors, forge, sockets, gates,
  S-box grid, router, reactor, key cartridges, letter wheels, dialogue), gates opening, archives,
  inventory, map, and walking out of the exit: **no console errors**.
- Instructor dashboard, classroom analytics, demo mode (custom message/key, open Room 3), DES Lab
  (round 16, S-box details, key tab, input validation) and an internal link scan (no broken links).
- Mobile layout checked at iPhone 13 size.

---

## 7. Limitations / not included

- **Learning-gain claims:** the platform records pre/post scores but makes no claim that the game improves
  learning; the demo data is simulated.
- **Email** is printed to the terminal in the local demo (see "Password reset"); a real mail server must be
  configured for deployment.
- **Drag-and-drop on phones:** browsers' native drag-and-drop doesn't work with touch, so on phones and
  tablets the key-order puzzle uses the tap-to-place fallback.
- **Advanced replay challenges** beyond the optional bonus S-box are not separate unlockable levels;
  variety comes from new values, rounds, groups and positions each adventure.
- **Deployment:** configured for a local demo (SQLite, Django dev server). The public prototype remains an archive. For hosting the merged edition, set
  `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` and run behind a production server.
- Automated UI tests are Playwright scripts we ran during development (`tools/ui_tests/`), not part of `manage.py test`.
