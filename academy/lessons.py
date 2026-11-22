"""Expected outputs for the toy signals in the interactive lesson guide."""

PRACTICE_ANSWERS = {
    "block": "10", "ip": "3", "halves": "76543210", "parity": "28", "pc1": "3",
    "split": "1234567", "rotate": "11010", "pc2": "3", "subkey": "0A6", "expand": "4",
    "xor": "1100", "sbox": "1,13", "advanced": "1,13", "p": "3", "feistel_xor": "2",
    "feistel": "A 2", "order": "K5", "decrypt": "01234567", "recover": "DES", "verdict": "16",
}


def practice_answer(puzzle):
    if puzzle.code == "ascii":
        return puzzle.data["characters"][1][3]
    return PRACTICE_ANSWERS[puzzle.code]


def normalize_practice(value):
    return " ".join(value.strip().upper().split()).replace(" ,", ",").replace(", ", ",")
