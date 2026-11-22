"""Browser smoke test for a running, disposable CipherBreak development database."""
import re
from argparse import ArgumentParser
from secrets import token_urlsafe
from urllib.parse import urlparse
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def check_application(browser, base_url, viewport):
    context = browser.new_context(viewport=viewport, reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)

    def button(name):
        return page.get_by_role("button", name=name, exact=True)

    def heading(name):
        return page.get_by_role("heading", name=name, exact=True)

    def fits():
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), page.url

    response = page.goto(base_url)
    assert response and response.ok
    expect(heading("The 16-Round Escape.")).to_be_visible()
    fits()
    page.get_by_role("link", name="Start playing").click()
    username = f"browser-test-{uuid4().hex[:10]}"
    password = token_urlsafe(20)
    page.locator("#id_username").fill(username)
    page.locator("#id_password1").fill(password)
    page.locator("#id_password2").fill(password)
    button("Create account").click()
    expect(heading(f"Welcome back, {username}.")).to_be_visible()

    button("Start adventure").click()
    expect(heading("Mission briefing")).to_be_visible()
    button("Enter the lobby").click()
    tutorial = page.get_by_role("dialog")
    expect(tutorial).to_be_visible()
    expect(heading("Read the objective")).to_be_visible()
    tutorial.press("ArrowRight")
    expect(heading("Find the terminal")).to_be_visible()
    button("Back").click()
    expect(heading("Read the objective")).to_be_visible()
    with page.expect_response(lambda response: response.url.endswith("/tutorial/") and response.status == 204):
        button("Skip tutorial").click()
    expect(tutorial).to_be_hidden()

    button("Enter Hex Gate").click()
    expect(heading("The Hex Gate")).to_be_visible()
    expect(page.locator("body > .site-header")).to_be_hidden()
    button("Access card").click()
    expect(heading("Inventory")).to_be_visible()
    access_code = page.locator("[data-access-card] code").inner_text()
    page.keyboard.press("Escape")
    button("Access terminal").click()
    expect(heading("ASCII bytes")).to_be_visible()
    button("Show example").click()
    expect(page.get_by_role("list", name="Worked example")).to_be_visible()
    button("Try practice").click()
    page.get_by_label("Practice answer").fill("ZZ")
    button("Check practice").click()
    expect(page.get_by_text("Try the practice signal again", exact=False)).to_be_visible()
    page.reload()
    button("Access terminal").click()
    expect(page.get_by_label("Practice answer")).to_be_visible()
    page.get_by_label("Practice answer").fill(f"{ord(access_code[1]):02X}")
    button("Check practice").click()
    expect(heading("Translate the access code")).to_be_visible()
    hex_bytes = []
    for character in page.get_by_role("button", name="Inspect character", exact=False).all():
        character.click()
        display = page.locator("[data-byte-output]").inner_text()
        hex_bytes.append(f"{int(re.search(r'ASCII (\d+)', display)[1]):02X}")
    page.get_by_label("Hexadecimal answer").fill("".join(hex_bytes))
    button("Verify answer").click()
    expect(page.locator("[data-objective]")).to_have_text("Check the block width")
    page.reload()
    expect(page.locator("[data-objective]")).to_have_text("Check the block width")
    button("Hint").click()
    page.get_by_role("button", name="Reveal hint 1", exact=False).click()
    expect(page.get_by_text("Each hexadecimal digit represents four bits.").last).to_be_visible()
    page.keyboard.press("Escape")
    fits()

    button("Pause").click()
    page.get_by_role("link", name="Dashboard").filter(visible=True).click()
    page.get_by_role("link", name="DES lab", exact=True).click()
    expect(page.locator("#block")).to_have_value("0123456789ABCDEF")
    expect(page.locator("#key")).to_have_value("133457799BBCDFF1")
    button("Encrypt").click()
    expect(page.locator(".output-highlight code")).to_have_text("85E813540F0AB405")
    page.get_by_role("combobox", name="DES round", exact=True).select_option("16")
    expect(heading("Round 16 · Subkey K16")).to_be_visible()
    expect(heading("Round 1 · Subkey K1")).to_be_hidden()
    page.get_by_role("combobox", name="Key schedule round", exact=True).select_option("16")
    expect(page.locator("#keys article[data-round-panel='16']")).to_contain_text("CB3D8B0E17F5")
    page.locator("#block").fill("85E813540F0AB405")
    button("Decrypt").click()
    expect(page.locator(".output-highlight code")).to_have_text("0123456789ABCDEF")
    expect(heading("Round 1 · Subkey K16")).to_be_visible()
    fits()
    assert not errors, errors
    context.close()


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/")
    parser.add_argument("--chromium", help="Use an existing Chromium binary instead of Playwright's bundled one.")
    args = parser.parse_args()
    url = urlparse(args.base_url)
    if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Use a localhost development server. The test creates fictional accounts.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium)
        for viewport in ({"width": 1440, "height": 960}, {"width": 390, "height": 844}):
            check_application(browser, args.base_url, viewport)
            print(f"Passed Chromium smoke test at {viewport['width']}×{viewport['height']}.")
        browser.close()


if __name__ == "__main__":
    main()
