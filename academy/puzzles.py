"""Versioned, deterministic mission generation and authoritative puzzle answers."""
from dataclasses import dataclass, field
from random import Random

from . import des


@dataclass
class Puzzle:
    code: str
    title: str
    outcome: str
    prompt: str
    answer: str
    feedback: str
    hints: tuple
    widget: str = "choices"
    data: dict = field(default_factory=dict)
    choices: tuple = ()
    optional: bool = False

    def check(self, value):
        clean = value.strip().upper()
        if self.widget == "pair":
            clean = " ".join(clean.replace(",", " ").split())
        return clean == self.answer.upper()


@dataclass
class Mission:
    message: str
    encryption: dict
    decryption: dict
    rooms: tuple
    selected_round: int


def example(concept, sample, method):
    return concept, sample, method


def mapping(code, title, outcome, label, table, source, width, rng, result):
    position = rng.randrange(len(table))
    correct = table[position]
    options = rng.sample([n for n in range(1, width + 1) if n != correct], 3)
    options.append(correct)
    rng.shuffle(options)
    return Puzzle(
        code, title, outcome, f"Which input position feeds output bit {position + 1}?", str(correct),
        f"Output bit {position + 1} reads input bit {correct}. Full {label} output: {result}.",
        example("A mapping table tells you where each output bit comes from.",
                "For the toy table [3, 1, 2], output bit 2 reads input bit 1.",
                f"Find output position {position + 1} on the board and read the listed input position."),
        "mapping", {"label": label, "source": source, "width": width, "target": position + 1,
                    "mapping": list(enumerate(table, 1))},
        tuple((str(n), f"Input bit {n}") for n in options),
    )


def build_mission(seed):
    rng = Random(seed)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    message = "".join(rng.choices(alphabet, k=8))
    key = "".join(f"{byte | (1 ^ byte.bit_count() % 2):02X}" for byte in
                  (rng.getrandbits(7) << 1 for _ in range(8)))
    block = message.encode("ascii").hex().upper()
    enc = des.trace_des(block, key)
    dec = des.trace_des(enc["output"], key, decrypt=True)
    schedule = enc["key_schedule"]
    key_round = rng.choice(schedule["rounds"])
    round_data = rng.choice(enc["rounds"])
    decrypt_round = dec["rounds"][0]
    box = rng.choice(round_data["sboxes"])
    other_box = next(entry for entry in round_data["sboxes"] if entry["number"] != box["number"])
    characters = [(c, ord(c), f"{ord(c):08b}", f"{ord(c):02X}") for c in message]
    original_bits = f"{int(key, 16):064b}"
    key_bits = [(i, bit) for i, bit in enumerate(original_bits, 1)]

    hex_gate = (
        Puzzle("ascii", "Translate the access code", "LO1", "Enter the eight ASCII bytes as 16 hexadecimal digits.",
               block, f"Access block verified. The terminal reads {block}.",
               example("One ASCII character uses one byte. Write each byte as two hex digits.",
                       "A is decimal 65, binary 01000001 and hex 41.",
                       "Inspect each character left to right. Concatenate the two-digit values and keep any leading zero."),
               "ascii", {"characters": characters}),
        Puzzle("block", "Check the block width", "LO1", "Which representation can be passed to DES as one block?",
               "16", "Exactly 16 hex digits × 4 bits gives one 64-bit block.",
               example("Each hexadecimal digit represents four bits.", "Eight hex digits represent 32 bits.",
                       "Divide the 64-bit block width by the size of one hex digit."),
               "choices", {"bytes": [v[3] for v in characters]},
               (("8", "8 hexadecimal digits"), ("16", "16 hexadecimal digits"), ("32", "32 hexadecimal digits"))),
        mapping("ip", "Route the initial permutation", "LO1", "IP", des.IP, block, 64, rng, enc["ip"]),
        Puzzle("halves", "Identify L₀ and R₀", "LO1", "Select the two 32-bit halves in their correct order.",
               "first", f"L₀ = {enc['l0']} and R₀ = {enc['r0']}. The Hex Gate is open.",
               example("Split the permuted block down the middle.", "AABBCCDD11223344 splits into AABBCCDD and 11223344.",
                       "Read the first eight hex digits as L₀ and the last eight as R₀."),
               "choices", {"signals": [("IP output", enc["ip"])]},
               (("second", f"L₀ {enc['r0']}  /  R₀ {enc['l0']}"), ("first", f"L₀ {enc['l0']}  /  R₀ {enc['r0']}"))
               if enc["l0"] != enc["r0"] else (("second", "Two 16-bit halves"), ("first", "Two 32-bit halves"))),
    )
    key_vault = (
        Puzzle("parity", "Inspect the original key", "LO2", "How many bits actually contribute to DES key strength?",
               "56", "Eight parity positions leave 56 effective key bits.",
               example("DES omits one parity bit per byte.", "Two bytes with one parity bit each leave fourteen data bits.",
                       "Find the eight highlighted parity positions and subtract them from the full 64-bit representation."),
               "parity", {"key": key, "bits": key_bits},
               (("64", "64 effective bits"), ("48", "48 effective bits"), ("56", "56 effective bits"))),
        mapping("pc1", "Activate PC-1", "LO3", "PC-1", des.PC1, key, 64, rng, schedule["pc1"]),
        Puzzle("split", "Split the selected key", "LO3", "Select C₀ and D₀ in the correct order.",
               "split", f"C₀ = {schedule['c0']} and D₀ = {schedule['d0']}.",
               example("C₀ and D₀ are equal-width halves of the PC-1 output.",
                       "An eight-bit value 11001010 splits into 1100 and 1010.",
                       "Take the first seven hex digits for C₀ and the last seven for D₀."),
               "choices", {"signals": [("PC-1 output", schedule["pc1"]),
                                     ("PC-1 bits", f"{int(schedule['pc1'], 16):056b}")]},
               (("split", f"C₀ {schedule['c0']}  /  D₀ {schedule['d0']}"),
                ("swap", f"C₀ {schedule['d0']}  /  D₀ {schedule['c0']}"))
               if schedule["c0"] != schedule["d0"] else (("split", "Two 28-bit halves"), ("swap", "Two 32-bit halves"))),
        Puzzle("rotate", "Turn both key disks", "LO3",
               f"Perform the scheduled circular left rotation for round {key_round['number']}.",
               str(key_round["shift"]),
               f"C becomes {key_round['c']} and D becomes {key_round['d']}. The wrapped bits are preserved.",
               example("A circular shift wraps the leftmost bits to the right.", "10110 rotated left by two becomes 11010.",
                       f"Read the shift schedule at round {key_round['number']}, then rotate both halves by that many positions."),
               "rotation", {"round": key_round, "schedule": list(enumerate(des.SHIFTS, 1)),
                            "c_bits": f"{int(key_round['c_before'], 16):028b}", "d_bits": f"{int(key_round['d_before'], 16):028b}"},
               (("1", "Rotate left by 1"), ("2", "Rotate left by 2"))),
        mapping("pc2", "Generate the round subkey", "LO3", "PC-2", des.PC2, key_round["combined"], 56, rng, key_round["subkey"]),
    )
    bit_index = rng.randrange(48)
    a = f"{int(round_data['expanded'], 16):048b}"[bit_index]
    b = f"{int(round_data['key'], 16):048b}"[bit_index]

    def box_puzzle(code, title, entry, optional=False):
        table = des.S_BOXES[entry["number"] - 1]
        return Puzzle(
            code, title, "LO5", f"Select the cell used by S{entry['number']} for this six-bit input.",
            f"{entry['row']},{entry['column']}",
            f"Row {entry['row']}, column {entry['column']} gives {entry['value']} = {entry['output']}₂.",
            example("The outer two bits select the row. The middle four select the column.",
                    "Input 100101 gives row 11₂ = 3 and column 0010₂ = 2.",
                    "Join the first and last bits. Read that binary number as a row. Convert the four middle bits to the column number."),
            "sbox", {"box": entry, "table": list(enumerate(table)), "columns": range(16)},
            optional=optional,
        )

    reactor = (
        mapping("expand", "Bring expansion E online", "LO4", "E", des.E, round_data["r_in"], 32, rng, round_data["expanded"]),
        Puzzle("xor", "Close the XOR circuit", "LO4", f"Compute bit {bit_index + 1} of E(R) ⊕ K.",
               str(int(a) ^ int(b)), f"The full 48-bit XOR output is {round_data['mixed']}.",
               example("XOR is 1 when the two bits differ.", "0 ⊕ 1 = 1, and 1 ⊕ 1 = 0.",
                       f"Compare the two highlighted input bits, {a} and {b}, and choose the output."),
               "xor", {"a": a, "b": b, "signals": [("Expansion E(R)", round_data["expanded"]), ("Round key K", round_data["key"])]},
               (("0", "Output 0"), ("1", "Output 1"))),
        box_puzzle("sbox", "Route the S-box signal", box),
        mapping("p", "Run the P permutation", "LO4", "P", des.P, round_data["substituted"], 32, rng, round_data["permuted"]),
        Puzzle("feistel", "Update the Feistel halves", "LO4", "Enter the new L and R, each with eight hex digits, separated by a space.",
               f"{round_data['l_out']} {round_data['r_out']}",
               f"The reactor is online. After all 16 rounds, the ciphertext is {enc['output']}.",
               example("The new L is the old R. The new R is the old L XOR the P output.",
                       "For L = A, R = 7 and P = 3, new L = 7 and new R = A ⊕ 3 = 9.",
                       "Copy the old R. XOR the old L with the P result one hex digit at a time, preserving leading zeros."),
               "pair", {"signals": [("Old L", round_data["l_in"]), ("Old R", round_data["r_in"]), ("P output", round_data["permuted"])]}),
        box_puzzle("advanced", "Calibrate a second S-box", other_box, optional=True),
    )
    chamber = (
        Puzzle("order", "Reverse the key sequence", "LO6", "Choose the subkey order for DES decryption.",
               "reverse", "Decryption uses the same Feistel circuit, applying K₁₆ through K₁.",
               example("DES decryption reuses all of the encryption keys.",
                       "A three-round Feistel example encrypted with K1, K2, K3 decrypts using K3, K2, K1.",
                       "Identify the order that starts at encryption's last round and ends at its first."),
               "choices", {"signals": [("Ciphertext", enc["output"]), ("DES key", key)]},
               (("forward", "K₁, K₂, …, K₁₆"), ("new", "Generate a new key schedule"), ("reverse", "K₁₆, K₁₅, …, K₁"))),
        Puzzle("decrypt", "Start the inverse path", "LO6", "Which eight-digit value becomes L after the first decryption round?",
               decrypt_round["l_out"], "First inverse round verified. Run the full decryption sequence to read the recovered block.",
               example("Reversing the subkeys leaves the Feistel update rules intact.",
                       "If the old right half is 01020304, the new left half is 01020304.",
                       "Read the current right half after IP. Copy it to the left output without changing the value."),
               "text", {"signals": [("L after IP", dec["l0"]), ("R after IP", dec["r0"]),
                                   ("Applied K₁₆", decrypt_round["key"])]}),
        Puzzle("recover", "Recover the exit code", "LO6", "Decode the recovered hex block and enter the eight ASCII characters.",
               bytes.fromhex(dec["output"]).decode("ascii"), f"Exit code {message} accepted. NOVA has one final question.",
               example("Each pair of hex digits represents a single ASCII byte.",
                       "4C 41 42 decodes to LAB.",
                       "Read consecutive pairs left to right and consult the ASCII reference for the corresponding characters."),
               "recover", {"signals": [("Decrypted block", dec["output"])],
                           "reference": [(f"{ord(c):02X}", c) for c in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"]}),
        Puzzle("verdict", "Give the security verdict", "LO7", "Why should modern applications avoid single DES?",
               "short", "Correct. Exhaustive key search is feasible against the 56-bit key. Use an appropriate modern authenticated-encryption standard.",
               example("Effective key length determines the size of an exhaustive search.",
                       "A system with an eight-bit key has only 256 candidate keys.",
                       "Recall the effective key strength and connect it to exhaustive search and today's standards."),
               "choices", {}, (("working", "It is safe whenever encryption and decryption succeed."),
                               ("short", "Its 56-bit key is too short for modern security."),
                               ("hex", "Its hexadecimal representation exposes the key."))),
    )
    return Mission(message, enc, dec, (hex_gate, key_vault, reactor, chamber), round_data["number"])
