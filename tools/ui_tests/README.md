The browser check drives a full mission through the first-person scene controls, then checks that the floor-plan view uses the same attempt. It needs Node, Playwright and a local development server with seeded demo users.

```sh
python manage.py seed_demo
node tools/ui_tests/game_test.js student_demo guided
```

Use a disposable local database since the test starts an adventure for the selected demo account. Set `BASE_URL`, `CHROMIUM`, `PYTHON`, and `SHOTS` to override the local server, browser, Python executable, and screenshot directory. The solver is a local test utility that reads the database, and is not available through the website.
