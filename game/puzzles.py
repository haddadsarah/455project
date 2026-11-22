"""
Puzzle definitions for the four rooms.

Each puzzle is rebuilt on demand from the attempt's stored parameters. Every
expected answer comes from the DES engine (``des_engine``); nothing is
hard-coded. The client receives ``view`` (what to show), ``fields`` (what to
answer) and, after solving, ``reveal`` (the full computed values). The
``answer`` never leaves the server.
"""
from dataclasses import dataclass, field
from functools import lru_cache

from des_engine import ascii_to_hex, des_trace, encrypt, hex_to_ascii, hex_to_bits
from des_engine import tables as T
from des_engine.core import rotate_left

# ---------------------------------------------------------------------------
# Rooms, objectives and achievements
# ---------------------------------------------------------------------------

OBJECTIVES = {
    "LO1": "Represent a 64-bit block correctly in hexadecimal",
    "LO2": "Explain the 64-bit key representation and 56-bit effective key strength",
    "LO3": "Generate DES subkeys using PC-1, circular shifts and PC-2",
    "LO4": "Explain and follow the operations within a DES Feistel round",
    "LO5": "Perform S-box row/column calculations",
    "LO6": "Explain DES decryption and reversed round-key order",
    "LO7": "Explain why DES should not be used for modern security",
}

ROOMS = {
    1: {"name": "The Hex Gate", "badge": "hex_explorer",
        "puzzles": ["r1_ascii", "r1_block", "r1_ip_bit", "r1_split"]},
    2: {"name": "The Key Vault", "badge": "key_master",
        "puzzles": ["r2_parity", "r2_pc1_bit", "r2_split", "r2_shift", "r2_pc2", "r2_cycle"]},
    3: {"name": "The Round Reactor", "badge": "round_master",
        "puzzles": ["r3_expand", "r3_xor", "r3_sbox", "r3_sbox_bonus", "r3_perm", "r3_feistel", "r3_swap"]},
    4: {"name": "The Final Decryption Chamber", "badge": "graduate",
        "puzzles": ["r4_order", "r4_round", "r4_code", "r4_verdict"]},
}

ACHIEVEMENTS = {
    "hex_explorer": {"name": "Hex Explorer", "icon": "⬡",
                     "condition": "Unlock the Hex Gate (complete Room 1)."},
    "key_master": {"name": "Key Master", "icon": "🔑",
                   "condition": "Open the Key Vault by generating the round keys (complete Room 2)."},
    "sbox_specialist": {"name": "S-box Specialist", "icon": "▦",
                        "condition": "Solve the main AND the bonus S-box challenge with no wrong answers."},
    "round_master": {"name": "Round Master", "icon": "⚛",
                     "condition": "Repair the Round Reactor (complete Room 3)."},
    "reverse_engineer": {"name": "Reverse Engineer", "icon": "⇆",
                         "condition": "Solve the key-order and decryption-round challenges on the first try."},
    "graduate": {"name": "CipherBreak Graduate", "icon": "🎓",
                 "condition": "Escape the lab (complete Room 4)."},
}

POINTS_PER_PUZZLE = 100
WRONG_PENALTY = 10
HINT_PENALTIES = {1: 10, 2: 20, 3: 30}
ROOM_BONUS = 50


def room_of(pid):
    return int(pid[1])


def required_puzzles(room):
    return [p for p in ROOMS[room]["puzzles"] if not PUZZLE_META[p]["optional"]]


# ---------------------------------------------------------------------------
# Context: all DES values for one attempt
# ---------------------------------------------------------------------------

@lru_cache(maxsize=256)
def _context(code, exit_code, key):
    plain_hex = ascii_to_hex(code)
    enc = des_trace(plain_hex, key)
    exit_hex = ascii_to_hex(exit_code)
    cipher_exit = encrypt(exit_hex, key)
    dec = des_trace(cipher_exit, key, decrypt=True)
    return {"plain_hex": plain_hex, "enc": enc, "ks": enc["key_schedule"],
            "exit_hex": exit_hex, "cipher_exit": cipher_exit, "dec": dec}


def context(params):
    return _context(params["code"], params["exit_code"], params["key"])


# ---------------------------------------------------------------------------
# Puzzle object and answer normalisation
# ---------------------------------------------------------------------------

@dataclass
class Puzzle:
    id: str
    title: str
    nova: str                 # NOVA: what we are doing and why it matters
    task: str                 # one-line instruction
    view: dict
    fields: list
    answer: dict
    hints: list
    success: str              # learning summary after solving
    reveal: dict = field(default_factory=dict)
    tips: dict = field(default_factory=dict)  # field -> targeted feedback

    @property
    def meta(self):
        return PUZZLE_META[self.id]

    def public(self, solved=False, hints_used=0):
        data = {
            "id": self.id, "room": room_of(self.id), "title": self.title,
            "objective": self.meta["objective"],
            "objective_text": OBJECTIVES[self.meta["objective"]],
            "optional": self.meta["optional"], "concepts": self.meta["concepts"],
            "nova": self.nova, "task": self.task, "view": self.view,
            "fields": self.fields, "solved": solved,
            "hints": self.hints[:hints_used],
        }
        if solved:
            data["reveal"] = self.reveal
            data["success"] = self.success
            data["answer"] = self.answer  # safe to show once solved
        return data


class FormatError(ValueError):
    pass


def normalize(spec, raw):
    """Normalise one submitted field according to its spec."""
    kind = spec["kind"]
    raw = "" if raw is None else str(raw)
    text = raw.replace(" ", "").replace("_", "").strip()
    if text == "":
        raise FormatError(f"“{spec['label']}” is empty.")
    if kind == "hex":
        n = spec["length"]
        if len(text) == 4 * n and set(text) <= {"0", "1"}:
            text = format(int(text, 2), f"0{n}X")
        if not all(c in "0123456789abcdefABCDEF" for c in text):
            raise FormatError(f"“{spec['label']}” must contain only hex digits 0-9, A-F.")
        if len(text) != n:
            raise FormatError(f"“{spec['label']}” needs exactly {n} hex digits (you entered {len(text)}).")
        return text.upper()
    if kind == "bin":
        n = spec["length"]
        if not set(text) <= {"0", "1"}:
            raise FormatError(f"“{spec['label']}” must contain only 0 and 1.")
        if len(text) != n:
            raise FormatError(f"“{spec['label']}” needs exactly {n} bits (you entered {len(text)}).")
        return text
    if kind == "int":
        if not text.lstrip("-").isdigit():
            raise FormatError(f"“{spec['label']}” must be a whole number.")
        return str(int(text))
    if kind == "choice":
        allowed = [str(o["value"]) for o in spec["options"]]
        if text not in allowed:
            raise FormatError(f"Choose one option for “{spec['label']}”.")
        return text
    if kind == "order":
        parts = [p for p in text.replace(";", ",").split(",") if p]
        if not all(p.isdigit() for p in parts):
            raise FormatError("The order must be a list of round-key numbers.")
        return ",".join(str(int(p)) for p in parts)
    if kind == "text":
        return raw.strip()
    raise FormatError("Unknown field type")


def hexf(name, label, length, tip=None):
    return {"name": name, "label": label, "kind": "hex", "length": length, "tip": tip}


def binf(name, label, length):
    return {"name": name, "label": label, "kind": "bin", "length": length}


def intf(name, label):
    return {"name": name, "label": label, "kind": "int"}


def choicef(name, label, options):
    return {"name": name, "label": label, "kind": "choice",
            "options": [{"value": str(i), "label": t} for i, t in options]}


def ordered(texts, order):
    """Return (option_list, index_of_correct) with options shuffled by ``order``.
    texts[0] is always the correct answer."""
    opts = [(i, texts[i]) for i in order]
    return opts, "0"


def bit_table(bits, start=1):
    return [{"pos": i + start, "bit": b} for i, b in enumerate(bits)]


# ---------------------------------------------------------------------------
# ROOM 1 — The Hex Gate
# ---------------------------------------------------------------------------

def r1_ascii(p, ctx, mode):
    code = p["code"]
    chars = []
    for c in code:
        item = {"ch": c, "dec": ord(c), "bin": format(ord(c), "08b")}
        if mode != "challenge":
            item["hex"] = format(ord(c), "02X")
        chars.append(item)
    first = code[0]
    return Puzzle(
        id="r1_ascii", title="Decode the access code",
        nova=("The door needs a 64-bit block. The access code has 8 characters, and each ASCII "
              "character is one byte (8 bits). 8 × 8 = 64 bits, which is 16 hex digits."),
        task=f"Convert the access code “{code}” into its 16-digit hexadecimal block.",
        view={"kind": "ascii", "code": code, "chars": chars, "reveal_hex": mode != "challenge"},
        fields=[hexf("hex", "64-bit block (16 hex digits)", 16)],
        answer={"hex": ctx["plain_hex"]},
        hints=[
            "Each character is one byte. Split its 8 bits into two groups of 4 (nibbles); each nibble is one hex digit.",
            "Example with a different letter: 'A' = 65 = 0100 0001 → 4 and 1 → '41'. 'z' = 122 = 0111 1010 → '7A'.",
            f"Start with '{first}': ASCII {ord(first)} = {format(ord(first), '08b')[:4]} {format(ord(first), '08b')[4:]}. "
            "Convert each nibble (0000=0 … 1001=9, 1010=A … 1111=F), write the two digits, then repeat "
            "for the remaining 7 characters in order. You should end with exactly 16 digits.",
        ],
        success=f"Great! “{code}” is the 64-bit block {ctx['plain_hex']}. 8 ASCII bytes = 64 bits = 16 hex digits.",
        reveal={"hex": ctx["plain_hex"], "bin": hex_to_bits(ctx["plain_hex"])},
    )


def r1_block(p, ctx, mode):
    block = ctx["plain_hex"]
    k = p["r1"]["byte_index"]
    byte_hex = block[2 * (k - 1):2 * k]
    texts = ["Both: 8 ASCII characters (8 × 8 bits) and 16 hex digits (16 × 4 bits)",
             "Only the 8 characters; hex digits carry 8 bits each",
             "Only 8 hex digits, because each hex digit is one byte",
             "Neither; DES blocks are 56 bits"]
    opts, correct = ordered(texts, p["r1"]["block_options"])
    bytes_view = [{"index": i + 1, "hex": block[2 * i:2 * i + 2],
                   "bin": None if i + 1 == k else format(int(block[2 * i:2 * i + 2], 16), "08b")}
                  for i in range(8)]
    return Puzzle(
        id="r1_block", title="Inspect the 64-bit block",
        nova="A DES block is always 64 bits. Let's inspect it byte by byte to be sure you can move between hex and binary.",
        task=f"Answer the block question and write the 8 bits of byte {k} (hex {byte_hex}).",
        view={"kind": "block", "block": block, "bytes": bytes_view, "hidden_byte": k},
        fields=[choicef("choice", "Which representations contain exactly 64 bits?", opts),
                binf("bin", f"Byte {k} in binary (8 bits)", 8)],
        answer={"choice": correct, "bin": format(int(byte_hex, 16), "08b")},
        hints=[
            "Count bits: an ASCII character is 8 bits; one hex digit is 4 bits.",
            "Example: hex 5C → 5 = 0101, C = 1100 → 01011100. 16 hex digits × 4 bits = 64 bits.",
            f"Byte {k} is {byte_hex}. Convert '{byte_hex[0]}' to 4 bits, then '{byte_hex[1]}' to 4 bits, and join them.",
        ],
        tips={"choice": "Remember: 8 characters × 8 bits and 16 hex digits × 4 bits.",
              "bin": "Convert each hex digit separately into 4 bits."},
        success="Correct! 16 hex digits and 8 bytes both describe the same 64-bit block.",
        reveal={"bytes": [{"index": i + 1, "hex": block[2 * i:2 * i + 2],
                           "bin": format(int(block[2 * i:2 * i + 2], 16), "08b")} for i in range(8)]},
    )


def r1_ip_bit(p, ctx, mode):
    block_bits = ctx["enc"]["input"]["bin"]
    pos = p["r1"]["ip_position"]
    src = T.IP[pos - 1]
    examples = [{"out": e, "src": T.IP[e - 1], "bit": block_bits[T.IP[e - 1] - 1]}
                for e in p["r1"]["ip_examples"] if e != pos][:2]
    return Puzzle(
        id="r1_ip_bit", title="Initial Permutation (IP)",
        nova=("Before the rounds start, DES shuffles bit POSITIONS with the Initial Permutation. "
              "Bits move, but no bit changes its value. Output position i takes input bit IP[i]."),
        task=f"Using the IP table, which input bit lands in output position {pos}, and what is its value?",
        view={"kind": "ip", "bits": block_bits, "table": T.IP, "position": pos, "examples": examples},
        fields=[intf("source", f"Input bit number that moves to output position {pos}"),
                binf("value", "Value of that bit (0 or 1)", 1)],
        answer={"source": str(src), "value": block_bits[src - 1]},
        hints=[
            "Read the IP table left to right, row by row. The k-th number is the input bit that goes to output position k.",
            "Example: the first entry of IP is 58, so output bit 1 = input bit 58. The 9th entry is 60, so output bit 9 = input bit 60.",
            f"Count to entry #{pos} in the table (row {(pos - 1) // 8 + 1}, column {(pos - 1) % 8 + 1}). "
            "That number is the source bit. Then find that bit number in the original 64-bit block.",
        ],
        tips={"source": "Count entries row by row; each row has 8 entries.",
              "value": "Look up the source bit in the ORIGINAL block (before IP)."},
        success="Exactly. IP only rearranges positions, so the bit keeps its value at its new home.",
        reveal={"ip": ctx["enc"]["ip"], "mapping": {"out": pos, "src": src}},
    )


def r1_split(p, ctx, mode):
    enc = ctx["enc"]
    return Puzzle(
        id="r1_split", title="Split into L0 and R0",
        nova="The permuted block is cut into two 32-bit halves: L0 (left) and R0 (right). The Feistel rounds work on these halves.",
        task="Enter L0 and R0 in hex (8 hex digits = 32 bits each).",
        view={"kind": "split", "ip": enc["ip"]},
        fields=[hexf("l0", "L0 (left 32 bits)", 8), hexf("r0", "R0 (right 32 bits)", 8)],
        answer={"l0": enc["l0"]["hex"], "r0": enc["r0"]["hex"]},
        hints=[
            "32 bits = 8 hex digits. The block after IP has 16 hex digits.",
            "Example: if IP output were 0011223344556677, then L0 = 00112233 and R0 = 44556677.",
            "Take the first 8 hex digits of the IP result for L0 and the last 8 for R0 (not the original block!).",
        ],
        tips={"l0": "L0 comes from the block AFTER IP, first half.", "r0": "R0 is the second half of the IP output."},
        success="Great! Your 64-bit block is ready for the rounds. The Hex Gate is unlocking…",
        reveal={"l0": enc["l0"], "r0": enc["r0"]},
    )


# ---------------------------------------------------------------------------
# ROOM 2 — The Key Vault
# ---------------------------------------------------------------------------

def r2_parity(p, ctx, mode):
    ks = ctx["ks"]
    texts = ["Bits 8, 16, 24, …, 64 (the last bit of every byte)",
             "Bits 1, 9, 17, …, 57 (the first bit of every byte)",
             "Bits 57–64 (the whole last byte)",
             "None; all 64 bits are key bits"]
    opts, correct = ordered(texts, p["r2"]["parity_options"])
    return Puzzle(
        id="r2_parity", title="The original key",
        nova=("The vault key is written with 64 bits, but 8 of them are parity bits used only for "
              "error checking. DES ignores them, so only 56 bits give real key strength."),
        task="Identify the parity bits and the effective key length.",
        view={"kind": "key", "key": ks["key"]},
        fields=[choicef("choice", "Which bits are parity bits?", opts),
                intf("effective", "Effective key length (bits)")],
        answer={"choice": correct, "effective": "56"},
        hints=[
            "Each of the 8 key bytes donates one parity bit.",
            "In the key byte 0x13 = 0001001 1, the final bit (the 8th) is the parity bit.",
            "Parity bits sit at every 8th position. 64 − 8 = the number of effective bits.",
        ],
        tips={"effective": "Subtract the 8 parity bits from 64."},
        success="Right: a 64-bit key, but only 56 effective bits. That is 2^56 possible keys, which matters later.",
        reveal={"parity_positions": ks["parity_positions"], "parity_bits": ks["parity_bits"]},
    )


def r2_pc1_bit(p, ctx, mode):
    ks = ctx["ks"]
    pos = p["r2"]["pc1_position"]
    src = T.PC1[pos - 1]
    return Puzzle(
        id="r2_pc1_bit", title="Activate PC-1",
        nova="Permuted Choice 1 does two jobs at once: it DROPS the 8 parity bits and REARRANGES the other 56.",
        task=f"PC-1 output position {pos}: which key bit is selected, and what is its value?",
        view={"kind": "pc1", "key": ks["key"], "table": T.PC1, "position": pos},
        fields=[intf("source", f"Key bit selected for PC-1 position {pos}"),
                binf("value", "Value of that bit", 1)],
        answer={"source": str(src), "value": ks["key"]["bin"][src - 1]},
        hints=[
            "PC-1 has 56 entries (8 rows × 7). Entry k names the key bit placed at output position k.",
            "Example: PC-1 starts 57, 49, 41… so output bit 1 = key bit 57 and output bit 3 = key bit 41. Notice no multiple of 8 appears.",
            f"Count to entry #{pos} (row {(pos - 1) // 7 + 1}, column {(pos - 1) % 7 + 1}) and read that bit from the 64-bit key.",
        ],
        tips={"source": "Rows have 7 entries in PC-1.", "value": "Read the bit from the original 64-bit key."},
        success="Correct! PC-1 selected and rearranged the bits. Here is the full 56-bit result.",
        reveal={"pc1": ks["pc1"]},
    )


def r2_split(p, ctx, mode):
    ks = ctx["ks"]
    return Puzzle(
        id="r2_split", title="Split the key: C0 and D0",
        nova="The 56-bit PC-1 output splits into two 28-bit halves, C0 and D0. Each half rotates independently.",
        task="Enter C0 and D0 (7 hex digits each, or 28 bits).",
        view={"kind": "keysplit", "pc1": ks["pc1"]},
        fields=[hexf("c0", "C0 (first 28 bits)", 7), hexf("d0", "D0 (last 28 bits)", 7)],
        answer={"c0": ks["c0"]["hex"], "d0": ks["d0"]["hex"]},
        hints=[
            "56 / 2 = 28 bits. 28 bits = 7 hex digits.",
            "Example: if PC-1 gave F0CCAA0 + 556678F (14 hex digits) then C0 = F0CCAA0, D0 = 556678F.",
            "PC-1 is 14 hex digits; split them 7 + 7. You may also type the 28 bits of each half.",
        ],
        success="Right! C0 and D0 are loaded onto the vault's two rotating disks.",
        reveal={"c0": ks["c0"], "d0": ks["d0"]},
    )


def r2_shift(p, ctx, mode):
    ks = ctx["ks"]
    rnd = p["r2"]["shift_round"]
    info = ks["rounds"][rnd - 1]
    return Puzzle(
        id="r2_shift", title="Rotate the key disks",
        nova=("Every round, C and D rotate LEFT. Bits pushed off the left end re-enter on the right. "
              "Rounds 1, 2, 9 and 16 rotate by 1; all others rotate by 2."),
        task=f"Round {rnd}: rotate C{rnd - 1} and D{rnd - 1} to produce C{rnd} and D{rnd}.",
        view={"kind": "shift", "round": rnd, "c_prev": info["c_prev"], "d_prev": info["d_prev"],
              "schedule": T.SHIFTS},
        fields=[binf("c", f"C{rnd} (28 bits)", 28), binf("d", f"D{rnd} (28 bits)", 28)],
        answer={"c": info["c"]["bin"], "d": info["d"]["bin"]},
        hints=[
            "Look up round " + str(rnd) + " in the shift schedule, then rotate both halves left by that amount.",
            "Example: rotating 1011000 left by 1 gives 0110001; by 2 gives 1100010.",
            f"Round {rnd} uses a shift of {T.SHIFTS[rnd - 1]}. Press ⟲ on each disk that many times "
            "(or move the first bits to the end yourself).",
        ],
        success=f"Correct! Round {rnd} shifts by {T.SHIFTS[rnd - 1]}: the leading bits wrapped around to the end.",
        reveal={"c": info["c"], "d": info["d"], "shift": info["shift"]},
    )


def r2_pc2(p, ctx, mode):
    ks = ctx["ks"]
    rnd = p["r2"]["shift_round"]
    info = ks["rounds"][rnd - 1]
    pos = p["r2"]["pc2_position"]
    src = T.PC2[pos - 1]
    return Puzzle(
        id="r2_pc2", title="Activate PC-2",
        nova=("PC-2 picks 48 of the 56 bits of C‖D and rearranges them. 48 bits are needed because "
              "the round function expands the 32-bit half to 48 bits before XOR-ing it with the key."),
        task=f"Round key K{rnd}, position {pos}: which bit of C{rnd}‖D{rnd} does PC-2 select, and what is its value?",
        view={"kind": "pc2", "round": rnd, "cd": info["cd"], "table": T.PC2, "position": pos},
        fields=[intf("source", f"Bit of C‖D chosen for K{rnd} position {pos}"),
                binf("value", "Value of that bit", 1)],
        answer={"source": str(src), "value": info["cd"]["bin"][src - 1]},
        hints=[
            "PC-2 has 48 entries (8 rows × 6). Entry k = bit of C‖D placed at subkey position k.",
            "Example: PC-2 starts 14, 17, 11… so subkey bit 2 = bit 17 of C‖D. Bits 9, 18, 22, 25, 35, 38, 43 and 54 are never used.",
            f"Count to entry #{pos} (row {(pos - 1) // 6 + 1}, column {(pos - 1) % 6 + 1}) and read that bit of the 56-bit C‖D.",
        ],
        tips={"source": "PC-2 rows have 6 entries.", "value": "Read the bit from the combined 56-bit C‖D."},
        success=f"Correct! You generated round key K{rnd} = {info['subkey']['hex']}.",
        reveal={"subkey": info["subkey"], "round": rnd},
    )


def r2_cycle(p, ctx, mode):
    ks = ctx["ks"]
    texts_same = ["Yes, C16 equals C0 and D16 equals D0", "No, they are different"]
    return Puzzle(
        id="r2_cycle", title="Run the full key machine",
        nova="Now run the machine for all 16 rounds. Explore any round in the key explorer, then answer the vault's final check.",
        task="Use the explorer: how many positions have the disks rotated in total after round 16, and is C16 back to C0?",
        view={"kind": "keyexplorer", "schedule": ks},
        fields=[intf("total", "Total rotation after 16 rounds"),
                choicef("same", "Compare C16 with C0", list(enumerate(texts_same)))],
        answer={"total": "28", "same": "0"},
        hints=[
            "Add up the shift schedule 1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1.",
            "Example: after round 3 the total is 1+1+2 = 4. The explorer shows the running total for every round.",
            "The sum is the length of each half. Rotating a 28-bit value by 28 positions brings it back to the start — compare the values in rounds 0 and 16.",
        ],
        tips={"total": "Sum the 16 shift amounts."},
        success="Excellent. DES now has the sixteen round keys required for its Feistel network.",
        reveal={"subkeys": [r["subkey"]["hex"] for r in ks["rounds"]]},
    )


# ---------------------------------------------------------------------------
# ROOM 3 — The Round Reactor
# ---------------------------------------------------------------------------

def _round(p, ctx):
    return ctx["enc"]["rounds"][p["r3"]["round"] - 1]


def r3_expand(p, ctx, mode):
    rd = _round(p, ctx)
    positions = p["r3"]["expand_positions"]
    exp = rd["expanded"]["bin"]
    return Puzzle(
        id="r3_expand", title="Module 1 — Expansion E",
        nova=("The F-function starts by expanding the 32-bit right half to 48 bits. E copies the edge "
              "bits of each 4-bit group into neighbouring groups, so 16 bits appear twice."),
        task=f"Round {rd['round']}: give the bits of E(R{rd['round'] - 1}) at output positions {', '.join(map(str, positions))}.",
        view={"kind": "expand", "round": rd["round"], "r": rd["r_in"], "table": T.E, "positions": positions},
        fields=[binf(f"b{i}", f"E output bit {pos}", 1) for i, pos in enumerate(positions)],
        answer={f"b{i}": exp[pos - 1] for i, pos in enumerate(positions)},
        hints=[
            "E output position k takes bit E[k] of the 32-bit R. The table is 8 rows of 6.",
            "Example: E starts 32, 1, 2, 3, 4, 5 → output bit 1 is R's LAST bit (32), and output bit 48 is R's bit 1.",
            "For each asked position, find its entry in the E table (row = ⌈k/6⌉), then read that bit number from R.",
        ],
        success="Correct! E turned 32 bits into 48, ready to be mixed with the 48-bit round key.",
        reveal={"expanded": rd["expanded"]},
    )


def r3_xor(p, ctx, mode):
    rd = _round(p, ctx)
    g = p["r3"]["group"]
    return Puzzle(
        id="r3_xor", title="Module 2 — XOR with the round key",
        nova="Next, E(R) is XOR-ed with the round key. XOR gives 1 when the bits DIFFER and 0 when they are the same.",
        task=f"Complete the XOR circuit for bits {6 * g + 1}–{6 * g + 6} (the input to S-box S{g + 1}).",
        view={"kind": "xor", "round": rd["round"], "expanded": rd["expanded"], "subkey": rd["subkey"],
              "key_index": rd["key_index"], "group": g},
        fields=[binf("x", f"E(R) ⊕ K{rd['key_index']}, bits {6 * g + 1}–{6 * g + 6}", 6)],
        answer={"x": rd["xor"]["bin"][6 * g:6 * g + 6]},
        hints=[
            "Truth table: 0⊕0=0, 0⊕1=1, 1⊕0=1, 1⊕1=0.",
            "Example: 110010 ⊕ 011011 = 101001.",
            f"Line up E(R) bits {6 * g + 1}–{6 * g + 6} above the key bits {6 * g + 1}–{6 * g + 6} and XOR each column.",
        ],
        tips={"x": "Not quite. Remember that XOR returns 1 when the bits differ."},
        success="The circuit lights up! Here is the full 48-bit XOR result, split into 8 groups of 6.",
        reveal={"xor": rd["xor"]},
    )


def _sbox_puzzle(pid, title, p, ctx, g, optional_note=""):
    rd = _round(p, ctx)
    s = rd["sboxes"][g]
    return Puzzle(
        id=pid, title=title,
        nova=("Each S-box turns 6 bits into 4. The FIRST and LAST bits form the row (0–3); the MIDDLE "
              "four bits form the column (0–15). The cell gives a number 0–15, written as 4 bits." + optional_note),
        task=f"S-box S{g + 1} receives {s['input']}. Find its row, column and 4-bit output.",
        view={"kind": "sbox", "round": rd["round"], "box": g + 1, "input": s["input"], "table": T.SBOXES[g]},
        fields=[intf("row", "Row (0–3)"), intf("col", "Column (0–15)"), binf("out", "Output (4 bits)", 4)],
        answer={"row": str(s["row"]), "col": str(s["col"]), "out": s["output"]},
        hints=[
            "Row = bits 1 and 6 read as a 2-bit number. Column = bits 2–5 read as a 4-bit number.",
            "Example (S1): input 011011 → row bits 0,1 = 01 = 1; column 1101 = 13; S1[1][13] = 5 → 0101.",
            f"Your input is {s['input']}: the row bits are '{s['input'][0]}' and '{s['input'][5]}', "
            f"the column bits are '{s['input'][1:5]}'. Convert both to decimal, click that cell, and write the number in 4 bits.",
        ],
        tips={"row": "Row uses the first and last bits only.", "col": "Column uses the middle four bits.",
              "out": "Write the cell value as exactly 4 bits (e.g. 5 → 0101)."},
        success=f"Correct! S{g + 1}[{s['row']}][{s['col']}] = {s['value']} = {s['output']}.",
        reveal={"sbox": s},
    )


def r3_sbox(p, ctx, mode):
    return _sbox_puzzle("r3_sbox", "Module 3 — S-box substitution", p, ctx, p["r3"]["group"])


def r3_sbox_bonus(p, ctx, mode):
    return _sbox_puzzle("r3_sbox_bonus", "Bonus — A second S-box", p, ctx, p["r3"]["bonus_group"],
                        " This bonus challenge is optional; solve it with no mistakes for the S-box Specialist badge.")


def r3_perm(p, ctx, mode):
    rd = _round(p, ctx)
    pos = p["r3"]["p_position"]
    src = T.P[pos - 1]
    return Puzzle(
        id="r3_perm", title="Module 4 — Permutation P",
        nova="The eight 4-bit S-box outputs form 32 bits. P scatters them so each S-box influences several S-boxes in the next round.",
        task=f"P output position {pos}: which S-box output bit moves there, and what is its value?",
        view={"kind": "perm", "round": rd["round"], "s_output": rd["s_output"], "sboxes": rd["sboxes"],
              "table": T.P, "position": pos},
        fields=[intf("source", f"S-output bit that moves to position {pos}"), binf("value", "Its value", 1)],
        answer={"source": str(src), "value": rd["s_output"]["bin"][src - 1]},
        hints=[
            "P has 32 entries in 4 rows of 8. Entry k = the S-output bit placed at position k.",
            "Example: P starts 16, 7, 20 → output bit 1 is S-output bit 16; output bit 3 is S-output bit 20.",
            f"Count to entry #{pos} (row {(pos - 1) // 8 + 1}, column {(pos - 1) % 8 + 1}) and read that bit of the 32-bit S-box result.",
        ],
        success="Correct! The P output is F(R, K), the result of the round function.",
        reveal={"p_output": rd["p_output"], "f_output": rd["f_output"]},
    )


def r3_feistel(p, ctx, mode):
    rd = _round(p, ctx)
    i = rd["round"]
    return Puzzle(
        id="r3_feistel", title="Module 5 — Feistel update",
        nova=f"Now the Feistel rule: L{i} = R{i - 1}, and R{i} = L{i - 1} ⊕ F(R{i - 1}, K{i}).",
        task=f"Compute L{i} and R{i} in hex.",
        view={"kind": "feistel", "round": i, "l": rd["l_in"], "r": rd["r_in"], "f": rd["f_output"]},
        fields=[hexf("l", f"L{i}", 8), hexf("r", f"R{i}", 8)],
        answer={"l": rd["l_out"]["hex"], "r": rd["r_out"]["hex"]},
        hints=[
            "The new left half is simply the old right half. The new right half needs one XOR.",
            "Example: L=1234ABCD, F=0F0F0F0F → L⊕F = 1D3BA4C2 (XOR each hex digit through its 4 bits).",
            f"L{i} = R{i - 1} copied. For R{i}, XOR L{i - 1} and F digit by digit (the binary rows help).",
        ],
        tips={"l": f"L{i} is just a copy of R{i - 1}.", "r": "XOR the OLD left half with F."},
        success="You have successfully completed the Feistel update.",
        reveal={"l": rd["l_out"], "r": rd["r_out"]},
    )


def r3_swap(p, ctx, mode):
    enc = ctx["enc"]
    last = enc["rounds"][-1]
    texts = [f"R16‖L16 = {last['r_out']['hex']}{last['l_out']['hex']} (swap the halves)",
             f"L16‖R16 = {last['l_out']['hex']}{last['r_out']['hex']} (keep the order)"]
    opts, correct = ordered(texts, p["r3"]["swap_options"])
    return Puzzle(
        id="r3_swap", title="Ignite the reactor — all 16 rounds",
        nova=("The reactor now runs all 16 rounds automatically. Inspect any round. After round 16, DES "
              "undoes the last left/right exchange and then applies IP⁻¹."),
        task="Which 64-bit value enters the final IP⁻¹?",
        view={"kind": "fullrun", "trace": {k: enc[k] for k in ("input", "ip", "l0", "r0", "rounds", "key")}},
        fields=[choicef("choice", "Pre-output block", opts)],
        answer={"choice": correct},
        hints=[
            "Decryption must be able to reuse the same structure; this is why the halves are swapped at the end.",
            "Example: if L16 = AAAAAAAA and R16 = BBBBBBBB, the pre-output is BBBBBBBBAAAAAAAA.",
            "The pre-output places R16 first, then L16. Then IP⁻¹ gives the ciphertext.",
        ],
        success=f"Reactor online! Ciphertext = {enc['output']['hex']}.",
        reveal={"preoutput": enc["preoutput"], "output": enc["output"]},
    )


# ---------------------------------------------------------------------------
# ROOM 4 — The Final Decryption Chamber
# ---------------------------------------------------------------------------

def r4_order(p, ctx, mode):
    ks = ctx["ks"]
    chips = [{"k": i, "hex": ks["rounds"][i - 1]["subkey"]["hex"]} for i in p["r4"]["order_shuffle"]]
    return Puzzle(
        id="r4_order", title="Load the decryption keys",
        nova=("Decryption uses the SAME Feistel structure and the SAME 16 subkeys, applied in REVERSE "
              "order. No new keys are generated."),
        task="Click the round keys in the order the decryption rounds use them.",
        view={"kind": "order", "chips": chips, "cipher": ctx["cipher_exit"], "key": ctx["ks"]["key"]},
        fields=[{"name": "order", "label": "Key order (e.g. 3,1,2…)", "kind": "order"}],
        answer={"order": ",".join(str(i) for i in range(16, 0, -1))},
        hints=[
            "Decryption round 1 must undo encryption round 16.",
            "With a 3-round toy Feistel cipher using K1,K2,K3, decryption uses K3, K2, K1.",
            "Start with the key used last during encryption and finish with K1.",
        ],
        success="Correct: K16, K15, …, K1. Same keys, reversed order.",
        reveal={"order": list(range(16, 0, -1))},
    )


def r4_round(p, ctx, mode):
    dec = ctx["dec"]
    j = p["r4"]["round"]
    rd = dec["rounds"][j - 1]
    return Puzzle(
        id="r4_round", title="Run a decryption round",
        nova="A decryption round looks exactly like an encryption round. Only the key index changes.",
        task=f"Decryption round {j}: which subkey is used, and what are the new halves?",
        view={"kind": "decround", "round": j, "l": rd["l_in"], "r": rd["r_in"], "f": rd["f_output"]},
        fields=[intf("key", f"Subkey number used in decryption round {j}"),
                hexf("l", f"New left half after round {j}", 8), hexf("r", f"New right half after round {j}", 8)],
        answer={"key": str(rd["key_index"]), "l": rd["l_out"]["hex"], "r": rd["r_out"]["hex"]},
        hints=[
            "Decryption round j uses K(17 − j). The Feistel update is unchanged: new L = old R; new R = old L ⊕ F.",
            "Example: decryption round 3 uses K14.",
            f"Round {j} uses K{17 - j}. Copy the right half into the left, then XOR the left half with F.",
        ],
        tips={"key": "Decryption round j uses key 17 − j."},
        success="Correct! The chamber processes all 16 decryption rounds…",
        reveal={"trace": {k: dec[k] for k in ("input", "ip", "l0", "r0", "rounds", "preoutput", "output")}},
    )


def r4_code(p, ctx, mode):
    dec = ctx["dec"]
    out = dec["output"]["hex"]
    return Puzzle(
        id="r4_code", title="Recover the exit code",
        nova="The 16 decryption rounds produced 64 bits of plaintext. Turn those 8 bytes back into ASCII characters.",
        task="Enter the 8-character exit code hidden in the decrypted block.",
        view={"kind": "recover", "cipher": ctx["cipher_exit"], "plain": dec["output"],
              "trace": {k: dec[k] for k in ("input", "ip", "l0", "r0", "rounds", "preoutput", "output")}},
        fields=[{"name": "code", "label": "Exit code (8 characters)", "kind": "text"}],
        answer={"code": hex_to_ascii(out)},
        hints=[
            "Split the 16 hex digits into 8 pairs. Each pair is one ASCII character.",
            "Example: 41 = 65 = 'A', 30 = 48 = '0', 5A = 90 = 'Z'.",
            f"The first pair is {out[:2]} = {int(out[:2], 16)} in decimal. Use the ASCII helper for each pair.",
        ],
        tips={"code": "Convert each hex pair to its ASCII character; capitals matter."},
        success="The exit console accepts the code!",
        reveal={"plain": dec["output"]},
    )


VERDICT_QUESTIONS = [
    ("How many bits of a DES key provide cryptographic strength?",
     ["56 bits", "64 bits", "128 bits", "48 bits"]),
    ("Why is DES considered insecure today?",
     ["Its 56-bit key space can be searched exhaustively with modern hardware",
      "Its S-boxes are secret and unknown",
      "It cannot be decrypted correctly",
      "It uses too many rounds"]),
    ("What is DES's status today?",
     ["Obsolete: withdrawn as a standard and replaced (e.g. by AES)",
      "Recommended for new hospital systems",
      "Mandatory for modern web traffic",
      "Secure as long as the key is secret"]),
    ("You must protect real sensitive data. What should you choose?",
     ["A current standard such as AES-GCM or ChaCha20-Poly1305 (authenticated encryption)",
      "DES, since you now understand it well",
      "DES applied twice with the same key",
      "Your own homemade cipher"]),
]


def r4_verdict(p, ctx, mode):
    fields = []
    for i, (q, texts) in enumerate(VERDICT_QUESTIONS):
        opts, _ = ordered(texts, p["r4"]["verdict_options"][i])
        fields.append(choicef(f"q{i}", q, opts))
    return Puzzle(
        id="r4_verdict", title="The security verdict",
        nova=("You have successfully used DES. Does this mean DES is safe for protecting modern sensitive "
              "information?"),
        task="Answer NOVA's four security questions to open the exit.",
        view={"kind": "verdict"},
        fields=fields,
        answer={f"q{i}": "0" for i in range(len(VERDICT_QUESTIONS))},
        hints=[
            "Think about the effective key length you found in the Key Vault.",
            "2^56 ≈ 7.2 × 10^16 keys. Public DES-cracking efforts recovered keys in under a day back in 1998–1999.",
            "Understanding an algorithm is not the same as it being secure: modern systems use current, vetted, authenticated encryption.",
        ],
        success="Exactly. A functioning algorithm is not necessarily a secure algorithm.",
        reveal={},
    )


BUILDERS = {
    "r1_ascii": r1_ascii, "r1_block": r1_block, "r1_ip_bit": r1_ip_bit, "r1_split": r1_split,
    "r2_parity": r2_parity, "r2_pc1_bit": r2_pc1_bit, "r2_split": r2_split, "r2_shift": r2_shift,
    "r2_pc2": r2_pc2, "r2_cycle": r2_cycle,
    "r3_expand": r3_expand, "r3_xor": r3_xor, "r3_sbox": r3_sbox, "r3_sbox_bonus": r3_sbox_bonus,
    "r3_perm": r3_perm, "r3_feistel": r3_feistel, "r3_swap": r3_swap,
    "r4_order": r4_order, "r4_round": r4_round, "r4_code": r4_code, "r4_verdict": r4_verdict,
}

PUZZLE_META = {
    "r1_ascii": {"objective": "LO1", "optional": False, "concepts": ["overview", "sizes", "hex"]},
    "r1_block": {"objective": "LO1", "optional": False, "concepts": ["sizes", "hex"]},
    "r1_ip_bit": {"objective": "LO1", "optional": False, "concepts": ["ip"]},
    "r1_split": {"objective": "LO4", "optional": False, "concepts": ["ip", "feistel"]},
    "r2_parity": {"objective": "LO2", "optional": False, "concepts": ["sizes", "keys"]},
    "r2_pc1_bit": {"objective": "LO3", "optional": False, "concepts": ["keys"]},
    "r2_split": {"objective": "LO3", "optional": False, "concepts": ["keys"]},
    "r2_shift": {"objective": "LO3", "optional": False, "concepts": ["shifts"]},
    "r2_pc2": {"objective": "LO3", "optional": False, "concepts": ["keys"]},
    "r2_cycle": {"objective": "LO3", "optional": False, "concepts": ["shifts"]},
    "r3_expand": {"objective": "LO4", "optional": False, "concepts": ["feistel", "expansion"]},
    "r3_xor": {"objective": "LO4", "optional": False, "concepts": ["xor"]},
    "r3_sbox": {"objective": "LO5", "optional": False, "concepts": ["sbox"]},
    "r3_sbox_bonus": {"objective": "LO5", "optional": True, "concepts": ["sbox"]},
    "r3_perm": {"objective": "LO4", "optional": False, "concepts": ["pperm"]},
    "r3_feistel": {"objective": "LO4", "optional": False, "concepts": ["feistel"]},
    "r3_swap": {"objective": "LO4", "optional": False, "concepts": ["encryption"]},
    "r4_order": {"objective": "LO6", "optional": False, "concepts": ["decryption"]},
    "r4_round": {"objective": "LO6", "optional": False, "concepts": ["decryption"]},
    "r4_code": {"objective": "LO6", "optional": False, "concepts": ["decryption", "hex"]},
    "r4_verdict": {"objective": "LO7", "optional": False, "concepts": ["security"]},
}

assert set(BUILDERS) == set(PUZZLE_META) == {p for r in ROOMS.values() for p in r["puzzles"]}


def build(params, pid, mode="guided"):
    if pid not in BUILDERS:
        raise KeyError(pid)
    return BUILDERS[pid](params, context(params), mode)


def check(puzzle, submitted):
    """Return (correct, errors, field_results, feedback).

    ``errors`` lists format problems (the attempt is NOT counted as a mistake);
    ``field_results`` maps field -> True/False for well-formed answers.
    """
    submitted = submitted or {}
    normalized, errors = {}, []
    for spec in puzzle.fields:
        try:
            normalized[spec["name"]] = normalize(spec, submitted.get(spec["name"]))
        except FormatError as exc:
            errors.append(str(exc))
    if errors:
        return False, errors, {}, "Check the format first: " + " ".join(errors)
    results = {name: normalized[name] == str(puzzle.answer[name]) for name in puzzle.answer}
    if all(results.values()):
        return True, [], results, puzzle.success
    wrong = [n for n, ok in results.items() if not ok]
    feedback = _diagnose(puzzle, normalized, wrong)
    return False, [], results, feedback


def _diagnose(puzzle, given, wrong):
    """Targeted NOVA feedback for common mistakes."""
    pid = puzzle.id
    if pid == "r2_shift":
        view = puzzle.view
        rnd, need = view["round"], T.SHIFTS[view["round"] - 1]
        c_prev = view["c_prev"]["bin"]
        for amount in (0, 1, 2, 3):
            if given.get("c") == rotate_left(c_prev, amount) and amount != need:
                return f"Not quite. You rotated by {amount}; round {rnd} needs a shift of {need}."
        if given.get("c") == rotate_left(c_prev, -need):
            return "Careful: DES rotates LEFT. Bits leaving the left end re-enter on the right."
    if pid == "r1_ascii":
        g, a = given.get("hex", ""), puzzle.answer["hex"]
        for i in range(8):
            if g[2 * i:2 * i + 2] != a[2 * i:2 * i + 2]:
                return f"Not quite. Characters before #{i + 1} are right; re-check character #{i + 1} ('{puzzle.view['code'][i]}')."
    if pid in ("r3_sbox", "r3_sbox_bonus") and given.get("row") == puzzle.answer["row"] \
            and given.get("col") == puzzle.answer["col"]:
        return "Row and column are right! Now read the cell value and write it as 4 bits."
    if pid == "r4_order":
        order = given.get("order", "")
        if order == ",".join(str(i) for i in range(1, 17)):
            return "That's the encryption order. Decryption must undo the LAST round first."
        if len(order.split(",")) != 16:
            return "Use all 16 round keys exactly once."
    if pid == "r4_code" and given.get("code", "").upper() == puzzle.answer["code"].upper():
        return "So close! ASCII capitals and lowercase letters have different hex values; check the case."
    tips = [puzzle.tips[n] for n in wrong if n in puzzle.tips]
    labels = [f["label"] for f in puzzle.fields if f["name"] in wrong]
    msg = "Not quite. Check: " + "; ".join(labels) + "."
    if tips:
        msg += " " + " ".join(tips)
    return msg
