"""Story, content and learning outcomes shared by the game and reporting."""

ROOMS = (
    {"name": "The Hex Gate", "short": "Hex Gate", "slug": "hex", "glyph": "⌗", "badge": "Hex Explorer",
     "topic": "Representation & initial permutation", "place": "Access corridor",
     "intro": "The bulkhead needs an eight-byte access block. Inspect the characters at the terminal and follow the signal through the initial permutation.",
     "summary": "You converted eight ASCII characters into a 64-bit block, moved the bits with IP and identified its two 32-bit halves."},
    {"name": "The Key Vault", "short": "Key Vault", "slug": "key", "glyph": "◇", "badge": "Key Master",
     "topic": "The sixteen-round key schedule", "place": "Key generation vault",
     "intro": "A 64-bit key is waiting in the vault. Bring the key schedule online, from parity-bit removal to the 48-bit output of PC-2.",
     "summary": "You selected 56 effective bits, split them into C and D, rotated both halves and generated 48-bit DES subkeys."},
    {"name": "The Round Reactor", "short": "Round Reactor", "slug": "reactor", "glyph": "✳", "badge": "Round Master",
     "topic": "Feistel rounds & S-box substitution", "place": "Encryption reactor",
     "intro": "The reactor is stalled mid-round. Restore its five modules, then watch the full sixteen-round encryption sequence.",
     "summary": "You expanded R, mixed in a subkey, substituted eight chunks, applied P and updated the Feistel halves."},
    {"name": "The Final Decryption Chamber", "short": "Decryption Chamber", "slug": "exit", "glyph": "⇄", "badge": "CipherBreak Graduate",
     "topic": "Reverse key order & the security verdict", "place": "Final exit",
     "intro": "The exit is holding your encrypted access code. Run the same Feistel circuit with the keys reversed, recover the code, and give NOVA your security verdict.",
     "summary": "You recovered the original code with reversed subkeys and explained why DES belongs in a historical teaching lab."},
)

OUTCOMES = {
    "LO1": "Represent a 64-bit block in hexadecimal.",
    "LO2": "Distinguish DES key representation from effective key strength.",
    "LO3": "Generate subkeys with PC-1, circular shifts and PC-2.",
    "LO4": "Follow the operations inside a DES Feistel round.",
    "LO5": "Use the row and column to locate an S-box output.",
    "LO6": "Explain DES decryption and reverse subkey order.",
    "LO7": "Explain the security limitations of DES.",
}

BADGES = {room["badge"]: room["summary"] for room in ROOMS}
BADGES.update({
    "S-box Specialist": "Select the correct S-box intersection in the Round Reactor.",
    "Reverse Engineer": "Recover the original access code in the Decryption Chamber.",
})

# The alternatives cover the same outcomes with different prompts and values.
ASSESSMENTS = {
    "pre": (
        ("How many hex digits represent one 64-bit DES block?", ("8", "16", "64"), 1),
        ("How many bits contribute to DES key strength?", ("64", "48", "56"), 2),
        ("What happens to a bit rotated out of the left edge of C?", ("It wraps to the right edge", "It is discarded", "It is XORed with D"), 0),
        ("How wide is R after expansion E?", ("32 bits", "56 bits", "48 bits"), 2),
        ("Which bits select an S-box row?", ("The four middle bits", "The two outer bits", "All six bits"), 1),
        ("Which subkey is applied first in DES decryption?", ("K16", "K1", "K8"), 0),
        ("Why is single DES obsolete?", ("It cannot be decrypted", "Exhaustive search of its short key is feasible", "It uses hexadecimal"), 1),
    ),
    "post": (
        ("An eight-character ASCII code occupies how many bits?", ("16", "128", "64"), 2),
        ("Which positions are omitted as parity by PC-1?", ("Every eighth bit", "Every fourth bit", "The last eight bits"), 0),
        ("How wide is the subkey produced by PC-2?", ("28 bits", "48 bits", "56 bits"), 1),
        ("In a Feistel round, what becomes the new left half?", ("Previous right half", "Previous left half", "The round key"), 0),
        ("For S-box input 100011, what are the row and column (decimal)?", ("Row 1, column 8", "Row 3, column 1", "Row 2, column 3"), 1),
        ("Which order reuses the encryption subkeys to decrypt?", ("K1, K2, …, K16", "New independent keys", "K16, K15, …, K1"), 2),
        ("What should protect new applications that need authenticated encryption?", ("Single DES", "An appropriate current authenticated-encryption standard", "A longer DES block"), 1),
    ),
}

NOTEBOOK = (
    (1, "DES overview", "DES is a historical symmetric block cipher. It applies 16 Feistel rounds to a 64-bit block.", "64 bits → IP → 16 rounds → swap → IP⁻¹", "The map follows this pipeline across the four rooms."),
    (1, "Block size, key size and hexadecimal", "One hex digit encodes four bits. An ASCII character occupies one byte, so eight ASCII bytes give sixteen hex digits. DES represents a key with 64 bits, including eight parity bits.", "A → 01000001 → 41", "Inspect a character at the Hex Gate terminal."),
    (1, "Initial permutation", "A permutation reads existing bits in a fixed order. For each output position j, read the input position listed at IP[j]. Then split into two 32-bit halves.", "IP[1] = 58 → output bit 1 comes from input bit 58", "The Hex Gate asks you to follow the map and split the result."),
    (2, "Key expansion", "PC-1 selects and rearranges 56 key bits, omitting each eighth parity bit. Split them into C₀ and D₀. Rotate each 28-bit half, join them and use PC-2 to select 48 bits.", "64 → PC-1 → 28 + 28 → rotate → PC-2 → 48", "Generate a round key at the Key Vault."),
    (2, "Shift schedule", "Each shift is a circular left rotation of the previous half. The leftmost bits wrap to the right.", "10110 rotated left twice → 11010", "The circular disks follow this rule with 28 bits per half."),
    (3, "Expansion and XOR", "E expands the right half to match the 48-bit key by copying some boundary bits. XOR produces 1 where the paired bits differ.", "0 ⊕ 0 = 0 · 0 ⊕ 1 = 1 · 1 ⊕ 0 = 1 · 1 ⊕ 1 = 0", "Use the mapping board and the XOR circuit in the reactor."),
    (3, "S-box substitutions", "Split the mixed value into eight six-bit inputs. The outer bits identify the row, and the middle four bits identify the column. Each table cell yields four bits.", "1 0010 1 → row 3, column 2", "Find the selected cell in the reactor's S-box table."),
    (3, "P permutation and Feistel update", "P reorders the 32 bits emitted by the S-boxes. Copy the right input to the left output, and XOR the left input with the P result to form the new right.", "Lᵢ = Rᵢ₋₁ · Rᵢ = Lᵢ₋₁ ⊕ F(Rᵢ₋₁, Kᵢ)", "Watch the last pair of round modules exchange the halves."),
    (3, "Encryption", "After the 16th round, concatenate R₁₆ and L₁₆, then apply the inverse initial permutation.", "R₁₆ ∥ L₁₆ → IP⁻¹ → ciphertext", "The Reactor displays the computed ciphertext."),
    (4, "Decryption", "DES's Feistel network uses the same operations with subkeys in reverse order. Apply K₁₆ first and K₁ last.", "ciphertext → IP → K₁₆ … K₁ → swap → IP⁻¹", "Recover the eight-character access code at the final exit."),
    (4, "Security limitations", "The effective 56-bit key makes exhaustive search feasible. Single DES is obsolete. Real applications should follow current standards and use an appropriate authenticated-encryption scheme.", "64 represented key bits · 56 effective bits · 64-bit block", "Explain your security verdict to NOVA."),
)
