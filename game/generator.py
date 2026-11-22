"""
Seeded generation of a new adventure.

``generate_params(seed)`` is deterministic: the same seed always yields the
same codes, key and puzzle selections. The result is stored on the Attempt so
that resuming never changes the puzzles. Every expected answer is derived
later from these parameters by the real DES engine (see puzzles.py).
"""
import random
import string

from des_engine import tables as T

# Fictional lab vocabulary used to build printable 8-character access codes.
WORDS = [
    "LAB", "NOVA", "HEX", "KEY", "BYTE", "BITS", "SBOX", "XOR", "IP", "PC", "FEIS",
    "ROUND", "VAULT", "GATE", "CODE", "LOCK", "DOOR", "CORE", "ATOM", "NODE", "BYTE",
    "ECHO", "ZETA", "OMEGA", "DELTA", "SIGMA", "ORBIT", "PIXEL", "QUARK", "RELAY",
]
CURATED = [
    "LAB4C127", "NOVA2026", "HEXGATE1", "SBOX8BIT", "KEYVAULT", "FEISTEL6", "ROUND16X",
    "CIPHER55", "AUB455XZ", "BLOCK64B", "ZETA7Q2K", "QUARK9RX", "ORBIT3MV", "DELTA4KQ",
]
FILL = string.ascii_uppercase + string.digits

# DES weak / semi-weak keys are avoided so every key schedule is interesting.
WEAK_KEYS = {
    "0101010101010101", "FEFEFEFEFEFEFEFE", "E0E0E0E0F1F1F1F1", "1F1F1F1F0E0E0E0E",
    "011F011F010E010E", "1F011F010E010E01", "01E001E001F101F1", "E001E001F101F101",
    "01FE01FE01FE01FE", "FE01FE01FE01FE01", "1FE01FE00EF10EF1", "E01FE01FF10EF10E",
    "1FFE1FFE0EFE0EFE", "FE1FFE1FFE0EFE0E", "E0FEE0FEF1FEF1FE", "FEE0FEE0FEF1FEF1",
}


def make_code(rng):
    """An 8-character printable code such as 'NOVA7Q2K'."""
    if rng.random() < 0.25:
        return rng.choice(CURATED)
    word = rng.choice(WORDS)[:6]
    return word + "".join(rng.choice(FILL) for _ in range(8 - len(word)))


def make_key(rng):
    """Random 64-bit key with correct odd parity in bits 8, 16, ..., 64."""
    while True:
        out = []
        for _ in range(8):
            seven = rng.getrandbits(7)
            ones = bin(seven).count("1")
            out.append((seven << 1) | (0 if ones % 2 else 1))
        key = "".join(format(b, "02X") for b in out)
        if key not in WEAK_KEYS:
            return key


def generate_params(seed, avoid_codes=()):
    rng = random.Random(seed)
    avoid = set(avoid_codes)
    code = make_code(rng)
    for _ in range(30):  # avoid recently used codes for this student
        if code not in avoid:
            break
        code = make_code(rng)
    exit_code = make_code(rng)
    while exit_code == code:
        exit_code = make_code(rng)

    # Room 3: a representative round and S-box group; bonus uses another group.
    r3_round = rng.randint(1, 16)
    groups = rng.sample(range(8), 2)
    # Expansion question: include one duplicated (edge) position and two others.
    edge_positions = [p for p in range(1, 49) if (p - 1) % 6 in (0, 5)]
    middle_positions = [p for p in range(1, 49) if (p - 1) % 6 not in (0, 5)]
    expand_positions = sorted([rng.choice(edge_positions)] + rng.sample(middle_positions, 2))

    # Room 2: pick a round whose shift is 2 about half the time.
    shift_round = rng.choice([r for r in range(1, 17) if T.SHIFTS[r - 1] == (2 if rng.random() < 0.5 else 1)])

    return {
        "version": 1,
        "code": code,
        "exit_code": exit_code,
        "key": make_key(rng),
        "r1": {
            "byte_index": rng.randint(1, 8),
            "ip_position": rng.randint(1, 64),
            "ip_examples": rng.sample(range(1, 65), 3),
            "block_options": rng.sample(range(4), 4),
        },
        "r2": {
            "pc1_position": rng.randint(1, 56),
            "shift_round": shift_round,
            "pc2_position": rng.randint(1, 48),
            "parity_options": rng.sample(range(4), 4),
        },
        "r3": {
            "round": r3_round,
            "group": groups[0],
            "bonus_group": groups[1],
            "expand_positions": expand_positions,
            "p_position": rng.randint(1, 32),
            "swap_options": rng.sample(range(2), 2),
        },
        "r4": {
            "round": rng.randint(2, 16),
            "order_shuffle": rng.sample(range(1, 17), 16),
            "verdict_options": [rng.sample(range(4), 4) for _ in range(4)],
        },
    }
