"""Play all four rooms in both modes against the browser edition."""
from argparse import ArgumentParser

from playwright.sync_api import sync_playwright, expect

parser = ArgumentParser(description=__doc__)
parser.add_argument("url", help="Served presentation edition URL.")
parser.add_argument("--chromium", help="Use this locally installed Chromium executable.")
args = parser.parse_args()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium)
    for viewport, mode in [({"width":1440,"height":900}, "Guided"), ({"width":390,"height":844}, "Challenge")]:
        page = browser.new_page(viewport=viewport, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        assert page.goto(args.url).ok
        page.get_by_role("button", name="Start new mission").click()
        page.get_by_role("button", name=mode + " mode").click()
        expect(page.get_by_role("heading",name="The Hex Gate",exact=True)).to_be_visible()
        expect(page.locator("body > .site-header")).to_be_hidden()
        page.get_by_role("button", name="Inspect door",exact=True).click()
        expect(page.get_by_role("heading", name="Security door", exact=True)).to_be_visible()
        page.keyboard.press("Escape")
        page.get_by_role("button", name="Access card",exact=True).click()
        expect(page.get_by_role("heading",name="Inventory",exact=True)).to_be_visible()
        page.keyboard.press("Escape")
        if mode == "Guided":
            page.get_by_role("button",name="Inventory 1").click()
            page.keyboard.press("Escape")
            page.get_by_role("button",name="Access terminal").click()
            page.get_by_role("button",name="Show example").click()
            page.get_by_role("button",name="Back",exact=True).click()
            page.get_by_role("button",name="Show example").click()
            page.get_by_role("button",name="Try practice").click()
            page.get_by_label("Practice answer").fill("wrong")
            page.get_by_role("button",name="Check practice").click()
            expect(page.get_by_role("status").filter(has_text="Check the example")).to_be_visible()
            page.reload()
            page.get_by_role("button",name="Access terminal").click()
            expect(page.get_by_label("Practice answer")).to_be_visible()
            page.keyboard.press("Escape")
            page.get_by_role("button",name="Read objective").click()
            page.get_by_role("button",name="Hint",exact=True).click()
            page.get_by_role("button",name="Reveal hint 1",exact=False).click()
            page.keyboard.press("Escape")
            page.get_by_role("button",name="Notebook",exact=True).click()
            page.keyboard.press("Escape")
        ids = [4,6,6,4]
        for room, count in enumerate(ids):
            for _ in range(count):
                task = page.evaluate("""() => {
                  const t=currentTask();
                  return {machine:t.machine,answer:t.answer,type:t.type,practice:currentLesson(t)[5],
                    shift:t.type==='rotate'?mission().sub.shift:null};
                }""")
                page.locator(f'[data-hot="{task["machine"]}"]').click()
                if mode == "Guided":
                    if page.get_by_role("button",name="Show example").count():
                        page.get_by_role("button",name="Show example").click()
                    if page.get_by_role("button",name="Try practice").count():
                        page.get_by_role("button",name="Try practice").click()
                    page.get_by_label("Practice answer").fill(task["practice"])
                    page.get_by_role("button",name="Check practice").click()
                answer = task["answer"]
                if task["type"] == "sbox":
                    row, column, _ = answer.split(",")
                    page.get_by_label("Decimal row").fill(row)
                    page.get_by_label("Decimal column").fill(column)
                    page.locator(f'[data-cell="{answer}"]').click()
                elif task["type"] == "xor":
                    for index, bit in enumerate(answer):
                        switch = page.locator(f'[data-switch="{index}"]')
                        switch.click()
                        if bit == "1":
                            switch.click()
                elif task["type"] == "map":
                    page.locator(f'[data-source-bit="{answer}"]').click()
                elif task["type"] == "rotate":
                    page.get_by_role("button",name=f"Rotate left by {task['shift']}").click()
                    page.get_by_label("Answer", exact=True).fill(answer)
                elif page.locator('input[type=radio]').count():
                    page.locator(f'input[value="{answer}"]').check()
                else:
                    page.get_by_label("Answer",exact=True).fill(answer)
                page.get_by_role("button",name="Verify signal").click()
                expect(page.get_by_role("heading",name="Signal verified.")).to_be_visible()
                page.get_by_role("button",name="Return to room",exact=True).last.click()
            page.get_by_role("button",name="Open door",exact=True).click()
            if room == 2:
                page.get_by_role("button",name="Run sixteen rounds").click()
                expect(page.locator("[data-trace-out]")).to_be_visible()
            page.get_by_role("button",name="Open the exit" if room==3 else "Enter next room").click()
        expect(page.get_by_role("heading",name="You escaped the Cipher Lab!")).to_be_visible()
        expect(page.get_by_text("CipherBreak Graduate",exact=True)).to_be_visible()
        page.get_by_role("link",name="Inspect DES rounds").click()
        expect(page.get_by_text("85E813540F0AB405",exact=True)).to_be_visible()
        expect(page.get_by_text("1B02EFFC7072", exact=True).first).to_be_visible()
        page.locator("#round-picker").select_option("15")
        expect(page.get_by_text("Key schedule · K16",exact=True)).to_be_visible()
        page.locator("#block").fill("85E813540F0AB405")
        page.get_by_role("button", name="Decrypt", exact=True).click()
        expect(page.get_by_text("Decryption trace", exact=True)).to_be_visible()
        expect(page.get_by_text("0123456789ABCDEF", exact=True)).to_be_visible()
        assert not errors, errors
        print(f"{mode} mode passed at width {viewport['width']}.")
