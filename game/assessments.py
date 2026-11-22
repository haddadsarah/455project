"""Pre/post assessment question bank. One question per learning objective;
the pre- and post-tests use different questions targeting the SAME objective.
The first option listed is correct; options are shuffled when displayed."""
import random

QUESTIONS = {
    "pre": [
        ("LO1", "How many hexadecimal digits represent one 64-bit DES block?",
         ["16", "8", "32", "64"]),
        ("LO2", "A DES key is written with 64 bits. How many of them give effective key strength?",
         ["56", "64", "48", "32"]),
        ("LO3", "Which step turns the 56-bit C‖D value into a 48-bit round key?",
         ["PC-2", "PC-1", "Expansion E", "The initial permutation"]),
        ("LO4", "In a Feistel round, what does the new left half L_i equal?",
         ["The previous right half R_(i-1)", "L_(i-1) XOR F(R_(i-1), K_i)", "The round key K_i", "The S-box output"]),
        ("LO5", "An S-box receives 6 bits b1…b6. Which bits choose the ROW?",
         ["b1 and b6", "b1 and b2", "b2 to b5", "b5 and b6"]),
        ("LO6", "How does DES decryption use the round keys?",
         ["The same 16 keys in reverse order (K16 … K1)",
          "A new set of 16 decryption keys", "The same keys in the same order", "Only K1"]),
        ("LO7", "Why is DES no longer recommended?",
         ["Its 56-bit key can be found by exhaustive search", "It is too slow on modern computers",
          "Its rounds cannot be reversed", "It only works on text"]),
    ],
    "post": [
        ("LO1", "The ASCII text 'CIPHER55' is converted to a DES block. How many bits is that?",
         ["64", "56", "128", "32"]),
        ("LO2", "Which bits of the 64-bit DES key are dropped by PC-1?",
         ["Bits 8, 16, 24, …, 64 (parity bits)", "Bits 1–8", "Bits 57–64", "No bits are dropped"]),
        ("LO3", "How far are C and D rotated in round 1 and in round 3?",
         ["1 position, then 2 positions", "2 positions both times", "1 position both times",
          "They are rotated right, not left"]),
        ("LO4", "Which order of operations is correct inside F(R, K)?",
         ["Expansion E → XOR with K → S-boxes → P", "S-boxes → XOR → E → P",
          "P → S-boxes → XOR → E", "XOR → P → E → S-boxes"]),
        ("LO5", "S-box input 100101: what are its row and column?",
         ["Row 3, column 2", "Row 2, column 5", "Row 1, column 9", "Row 3, column 9"]),
        ("LO6", "Which subkey does decryption round 4 use?",
         ["K13", "K4", "K12", "K14"]),
        ("LO7", "What should a new system use to protect sensitive data?",
         ["A current authenticated cipher such as AES-GCM", "DES with a longer password",
          "DES, because it worked in the game", "A homemade cipher"]),
    ],
}


def questions(kind, seed):
    """Return questions with shuffled options (stable for a given seed)."""
    rng = random.Random(seed)
    out = []
    for i, (lo, text, options) in enumerate(QUESTIONS[kind]):
        order = list(range(len(options)))
        rng.shuffle(order)
        out.append({"index": i, "objective": lo, "text": text,
                    "options": [{"value": str(j), "label": options[j]} for j in order]})
    return out


def grade(kind, answers):
    """answers: {index: chosen option value}. Correct option value is always '0'."""
    per = {}
    for i, (lo, _t, _o) in enumerate(QUESTIONS[kind]):
        per[lo] = 1 if str(answers.get(str(i))) == "0" else 0
    return sum(per.values()), len(per), per
