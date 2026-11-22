# CipherBreak EDU · The 16-Round Escape

A browser-based DES escape room for EECE 455 (Cryptography and Network Security) at the American University of Beirut. Four rooms take learners from an ASCII access code through key generation, a Feistel round, decryption, and a final security verdict. NOVA provides fictional story dialogue, interactive tutorials, and three levels of hints.

DES is a historical teaching example. Its 64-bit key representation has 56 effective key bits, which makes exhaustive search feasible. Real systems should use current, appropriate authenticated-encryption standards.

## Run locally

Use Python 3.10 or later and a current browser with JavaScript enabled. The app needs no Node build, API key, or external service.

```sh
git clone https://github.com/haddadsarah/455project.git
cd 455project
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`. Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The SQLite database is created in the checkout and ignored by Git.

Create a student account in the browser. To grant instructor tools to an approved account, create a separate account, then run `python manage.py create_instructor USERNAME`. Account registration always starts with student access.

## Demo accounts and reset

Run this on the development database before the presentation.

```sh
python manage.py demo_data
```

The command prints generated passwords and creates a fictional classroom with both assignment modes. It also populates completed and in-progress examples using the same game logic. Keep the printed passwords local.

| Account | What to show |
| --- | --- |
| `demo-student` | Start fresh, complete onboarding and enter the Hex Gate |
| `demo-reactor` | Resume in Room 3, work an XOR or S-box puzzle and show the trace |
| `demo-graduate` | Review the finished escape, six badges and assessment results |
| `demo-instructor` | Inspect the fictional class, export a CSV and open any room in demonstration mode |

Run `python manage.py demo_data --reset` to replace the marked demo accounts and rotate their passwords. It preserves other accounts and stops if demo and non-demo classroom memberships are linked. If you need an untouched database for automated browser tests, run them from a separate checkout.

A 15–20 minute presentation can begin with the landing page and the Hex Gate tutorial. Switch to the instructor demonstration for PC-1, circular shifts and PC-2. Resume the reactor mission for a mapped bit or S-box cell. Use the lab to show all 16 rounds, decrypt the known-answer ciphertext and explain the key-length limitation. Finish with the graduate’s results and the instructor’s assignment report.

## How gameplay and reporting work

- Each mission has a stored seed and generator version. The seed sets the block, odd-parity key, selected rounds and puzzle inputs. Signing out or refreshing preserves the mission and scores.
- Guided practice provides worked examples. Independent challenges offer optional hints. Viewing the mission’s full trace during an independent challenge flags it as assisted. Instructor reports count eligible completions for the required mode.
- A correct puzzle earns 100 base points, plus 10 for a first try. Mistakes deduct 10 each. The highest hint level deducts 10, 20, or 30. The minimum puzzle score is zero. Each cleared room earns 50 additional points. The reactor includes one optional S-box challenge.
- Each classroom assignment has its own roster report. For each student, it displays the most recent eligible completed attempt, then the most recent eligible in-progress attempt, then an assisted attempt when that is all that exists. The CSV includes nicknames, classification, results, and learning objectives. Paired pre/post summaries use attempts with both assessments.
- Elapsed time is wall-clock time from entering the first room. It is informational and has no effect on scores. The timed option shows a clock during play.

## Implementation map for the project team

| Area | Source |
| --- | --- |
| DES operations, trace and known-answer verification | [academy/des.py](academy/des.py), [academy/tests.py](academy/tests.py) |
| Puzzle generation, game state and persistence | [academy/puzzles.py](academy/puzzles.py), [academy/game.py](academy/game.py), [academy/models.py](academy/models.py), [academy/migrations](academy/migrations) |
| Django views, classroom analytics and access rules | [academy/views.py](academy/views.py), [cipherbreak/urls.py](cipherbreak/urls.py) |
| User interface, diagrams and curriculum | [templates](templates), [static/site.css](static/site.css), [static/site.js](static/site.js), [academy/curriculum.py](academy/curriculum.py) |
| Browser verification and demo setup | [tests/browser_smoke.py](tests/browser_smoke.py), [academy/management/commands/demo_data.py](academy/management/commands/demo_data.py) |

### How DES is calculated

1. Validate that the input and key each contain exactly 16 hex digits. Interpret the strings as unsigned 64-bit values, and format every traced value at its defined width so leading zeroes survive.
2. Apply IP by reading each output bit from the one-based position listed in the standard table. Split the result into the 32-bit halves L₀ and R₀.
3. For the key schedule, PC-1 selects and rearranges 56 bits, omitting the eight parity positions. Split the result into 28-bit C₀ and D₀, rotate each half by that round’s scheduled count, concatenate them, and select 48 bits with PC-2. Retain the old and new halves, the combined value and each generated subkey.
4. Each Feistel round expands R to 48 bits with E, XORs in the round key, and splits the result into eight six-bit chunks. Each S-box uses the first and last bits for the row and the middle four for the column. Combine the eight four-bit outputs and apply P. Copy the old R into the new L, and XOR the old L with the P result into the new R.
5. After round 16, concatenate R₁₆ and L₁₆, then apply the inverse of IP. To decrypt, apply the same process with the existing subkeys in reverse order.

The permutation and S-box tables follow [FIPS PUB 46-3](https://csrc.nist.gov/pubs/fips/46-3/final). DM Sans and Space Grotesk are bundled under their [SIL Open Font Licenses](static/fonts).

## Test

```sh
python manage.py test
python manage.py makemigrations --check --dry-run
```

The Django suite covers known-answer vectors, all 16 subkeys, intermediate values, both DES directions, mission generation, a complete four-room playthrough, scoring, assessments, saved progress, login, CSRF, classroom isolation, and CSV export.

For the optional desktop and mobile Chromium checks, start the app against a disposable local database and run the Playwright smoke test. It creates temporary fictional students.

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser_smoke.py
```

Pass `--chromium /path/to/chromium` to use an installed Chromium. Use `--base-url` if the local server runs on another port.

## Scope

The project is intended for local classroom demonstrations and formative assessment. It uses SQLite and Django development settings by default. Database progress survives a server restart. To retain logins across restarts, configure a stable `CIPHERBREAK_SECRET_KEY`. Any shared deployment needs separate hosting configuration and operational review. Independent mode records assistance in the app, while students can still use outside resources. Instructor analytics describe observed results and do not measure causal impact.
