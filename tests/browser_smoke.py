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
    expect(heading("Room briefing")).to_be_visible()
    button("Next").click()
    expect(heading("Watch an example")).to_be_visible()
    button("Next").click()
    expect(heading("Try it with a practice signal")).to_be_visible()
    expect(button("Finish tutorial")).to_be_disabled()
    button("65").click()
    expect(tutorial.get_by_role("status")).to_contain_text("Try again")
    button("41").click()
    with page.expect_response(lambda response: response.url.endswith("/tutorial/") and response.status == 204):
        button("Finish tutorial").click()
    expect(tutorial).to_be_hidden()
    fits()

    hex_bytes = []
    for character in page.get_by_role("button", name="Inspect character", exact=False).all():
        character.click()
        displayed = page.locator("[data-byte-output]").inner_text()
        hex_bytes.append(displayed.split("Hex ")[-1])
    assert len(hex_bytes) == 8 and all(len(byte) == 2 for byte in hex_bytes)
    page.get_by_label("Hexadecimal answer").fill("".join(hex_bytes))
    button("Verify answer").click()
    expect(heading("Check the block width")).to_be_visible()
    page.reload()
    expect(heading("Check the block width")).to_be_visible()
    page.get_by_role("button", name="Hint 1", exact=False).click()
    expect(page.get_by_text("Each hexadecimal digit represents four bits.").last).to_be_visible()
    fits()

    if viewport["width"] > 680:
        clear_remaining_rooms(page)

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


def clear_remaining_rooms(page):
    def click(name):
        page.get_by_role("button", name=name, exact=True).click()

    def choose(label):
        page.get_by_role("radio", name=label, exact=isinstance(label, str)).check()
        click("Verify answer")

    def solve_mapping():
        page.locator(".mapping-grid .target-bit").click()
        output = page.locator("[data-mapping-output]").inner_text()
        source = re.match(r"Input position (\d+)", output)[1]
        choose(f"Input bit {source}")

    def signals():
        return page.locator(".puzzle-form .value-grid code").all_inner_texts()

    def split(first, second, left, right):
        first_half, second_half = signals()[0][:first], signals()[0][first:first + second]
        choose(re.compile(f"{left} {first_half}.*{right} {second_half}"))

    def enter(room):
        click(f"Enter room {room}")
        click("Skip tutorial")

    choose("16 hexadecimal digits")
    solve_mapping()
    split(8, 8, "L₀", "R₀")
    enter(2)
    choose("56 effective bits")
    solve_mapping()
    split(7, 7, "C₀", "D₀")
    page.get_by_text("DES shift schedule", exact=True).click()
    shift = page.locator(".shift-grid .target-bit strong").inner_text()
    old_bits = page.locator("[data-c-out]").inner_text()
    page.get_by_role("radio", name=f"Rotate left by {shift}", exact=True).check()
    expected = old_bits[int(shift):] + old_bits[:int(shift)]
    expect(page.locator("[data-c-out]")).to_have_text(expected)
    click("Verify answer")
    solve_mapping()
    enter(3)
    solve_mapping()
    first, second = page.locator(".xor-circuit > span").all_inner_texts()
    choose(f"Output {int(first) ^ int(second)}")
    bits = "".join(page.locator(".sbox-input span").all_inner_texts())
    row, col = int(bits[0] + bits[-1], 2), int(bits[1:-1], 2)
    cell = page.get_by_role("button", name=re.compile(f"Row {row}, column {col}, value"))
    cell.click()
    expect(cell).to_have_attribute("aria-pressed", "true")
    click("Verify S-box cell")
    solve_mapping()
    left, right, permuted = signals()
    page.get_by_label("New left and right halves").fill(f"{right} {int(left, 16) ^ int(permuted, 16):08X}")
    click("Verify answer")
    click("Replay 16-round encryption")
    assert page.locator(".sequence-track .lit").count() == 16

    enter(4)
    choose("K₁₆, K₁₅, …, K₁")
    page.get_by_label("Hexadecimal answer").fill(signals()[1])
    click("Verify answer")
    click("Run 16-round decryption")
    assert page.locator(".sequence-track .lit").count() == 16
    page.get_by_label("Eight-character access code").fill(bytes.fromhex(signals()[0]).decode("ascii"))
    click("Verify answer")
    choose("Its 56-bit key is too short for modern security.")
    click("Open the exit")
    expect(page.get_by_role("heading", name="You escaped the Cipher Lab!", exact=True)).to_be_visible()
    expect(page.get_by_text("CipherBreak Graduate", exact=False)).to_be_visible()


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
