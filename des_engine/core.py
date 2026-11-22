"""
CipherBreak EDU — DES engine with complete intermediate-value tracing.

This module is pure Python and has no dependency on Django or on the game.
It implements the original DES (FIPS 46-3) for a single 64-bit block and
returns a structured, JSON-serialisable trace of every operation so that the
interface can render each step.

Conventions
-----------
* A "bit string" is a Python ``str`` of '0'/'1' characters. Bit 1 (as numbered
  in the standard) is the left-most character, index 0.
* Every traced value is reported both as hex (upper-case, zero-padded to the
  full width) and as binary.

Educational simulator only: DES is NOT secure for modern use (56-bit
effective key, broken by exhaustive search).
"""

from __future__ import annotations

import string

from . import tables as T

HEX_DIGITS = set(string.hexdigits)


class DESInputError(ValueError):
    """Raised when a message or key is not exactly 16 hexadecimal digits."""


# ---------------------------------------------------------------------------
# Validation and conversions
# ---------------------------------------------------------------------------

def validate_hex64(value, label="value"):
    """Return ``value`` normalised to 16 upper-case hex digits or raise.

    Spaces are allowed for readability (``"0123 4567 89AB CDEF"``) and are
    removed. A leading ``0x`` is not accepted to keep the rule simple for
    students: exactly 16 hex digits.
    """
    if value is None:
        raise DESInputError(f"The {label} is missing. Enter exactly 16 hexadecimal digits.")
    cleaned = str(value).replace(" ", "").strip()
    if cleaned == "":
        raise DESInputError(f"The {label} is missing. Enter exactly 16 hexadecimal digits.")
    bad = sorted({c for c in cleaned if c not in HEX_DIGITS})
    if bad:
        raise DESInputError(
            f"The {label} contains non-hexadecimal characters: {' '.join(bad)}. "
            "Use only 0-9 and A-F."
        )
    if len(cleaned) != 16:
        raise DESInputError(
            f"The {label} has {len(cleaned)} hex digits; DES needs exactly 16 "
            "(16 x 4 = 64 bits)."
        )
    return cleaned.upper()


def hex_to_bits(hex_str, width=None):
    """Hex string -> bit string. ``width`` defaults to 4 bits per hex digit."""
    width = width or len(hex_str) * 4
    return format(int(hex_str, 16), f"0{width}b")


def bits_to_hex(bits):
    """Bit string -> upper-case hex, zero-padded to ceil(len/4) digits."""
    digits = (len(bits) + 3) // 4
    return format(int(bits, 2), f"0{digits}X")


def permute(bits, table):
    """Apply a 1-based permutation/selection table to a bit string."""
    return "".join(bits[i - 1] for i in table)


def xor_bits(a, b):
    """XOR two equal-length bit strings."""
    if len(a) != len(b):
        raise ValueError("XOR operands must have the same length")
    return "".join("1" if x != y else "0" for x, y in zip(a, b))


def rotate_left(bits, n):
    """Circular left shift of a bit string by n positions."""
    n %= len(bits)
    return bits[n:] + bits[:n]


def value(bits):
    """Pack a bit string as {'hex', 'bin', 'bits'} for the interface."""
    return {"hex": bits_to_hex(bits), "bin": bits, "bits": len(bits)}


def ascii_to_hex(text):
    """8 printable ASCII characters -> 16 hex digits."""
    return "".join(format(ord(c), "02X") for c in text)


def hex_to_ascii(hex_str):
    """16 hex digits -> characters (non-printables shown as '.')."""
    out = []
    for i in range(0, len(hex_str), 2):
        code = int(hex_str[i:i + 2], 16)
        out.append(chr(code) if 32 <= code < 127 else ".")
    return "".join(out)


# ---------------------------------------------------------------------------
# Key schedule
# ---------------------------------------------------------------------------

def key_schedule(key_hex):
    """Generate the 16 round keys and a full trace of how they were made."""
    key_hex = validate_hex64(key_hex, "key")
    key_bits = hex_to_bits(key_hex, 64)
    pc1 = permute(key_bits, T.PC1)
    c, d = pc1[:28], pc1[28:]
    trace = {
        "key": value(key_bits),
        "parity_positions": list(T.PARITY_BITS),
        "parity_bits": "".join(key_bits[p - 1] for p in T.PARITY_BITS),
        "pc1": value(pc1),
        "c0": value(c),
        "d0": value(d),
        "rounds": [],
    }
    subkeys = []
    for rnd, shift in enumerate(T.SHIFTS, start=1):
        c_prev, d_prev = c, d
        c, d = rotate_left(c, shift), rotate_left(d, shift)
        cd = c + d
        k = permute(cd, T.PC2)
        subkeys.append(k)
        trace["rounds"].append({
            "round": rnd,
            "shift": shift,
            "total_shift": sum(T.SHIFTS[:rnd]),
            "c_prev": value(c_prev),
            "d_prev": value(d_prev),
            "c": value(c),
            "d": value(d),
            "cd": value(cd),
            "subkey": value(k),
        })
    return subkeys, trace


# ---------------------------------------------------------------------------
# Round function
# ---------------------------------------------------------------------------

def sbox_lookup(box_index, six_bits):
    """Look up one S-box (0-based index). Returns a trace dict."""
    row = int(six_bits[0] + six_bits[5], 2)
    col = int(six_bits[1:5], 2)
    val = T.SBOXES[box_index][row][col]
    return {
        "box": box_index + 1,
        "input": six_bits,
        "row_bits": six_bits[0] + six_bits[5],
        "col_bits": six_bits[1:5],
        "row": row,
        "col": col,
        "value": val,
        "output": format(val, "04b"),
    }


def feistel(r_bits, k_bits):
    """The DES F-function F(R, K) with every intermediate value."""
    expanded = permute(r_bits, T.E)
    mixed = xor_bits(expanded, k_bits)
    sboxes = [sbox_lookup(i, mixed[6 * i:6 * i + 6]) for i in range(8)]
    s_out = "".join(s["output"] for s in sboxes)
    p_out = permute(s_out, T.P)
    return p_out, {
        "expanded": value(expanded),
        "xor": value(mixed),
        "sboxes": sboxes,
        "s_output": value(s_out),
        "p_output": value(p_out),
    }


# ---------------------------------------------------------------------------
# Block encryption / decryption
# ---------------------------------------------------------------------------

def des_trace(block_hex, key_hex, decrypt=False):
    """Encrypt (or decrypt) one 64-bit block and return the complete trace.

    Decryption uses the identical Feistel structure with the SAME 16 subkeys
    applied in reverse order (K16 ... K1); no separate key set is generated.
    """
    block_hex = validate_hex64(block_hex, "ciphertext" if decrypt else "message")
    key_hex = validate_hex64(key_hex, "key")
    subkeys, ks_trace = key_schedule(key_hex)
    order = list(range(16, 0, -1)) if decrypt else list(range(1, 17))

    block = hex_to_bits(block_hex, 64)
    ip = permute(block, T.IP)
    left, right = ip[:32], ip[32:]
    trace = {
        "mode": "decrypt" if decrypt else "encrypt",
        "input": value(block),
        "key": value(hex_to_bits(key_hex, 64)),
        "ip": value(ip),
        "l0": value(left),
        "r0": value(right),
        "key_order": order,
        "rounds": [],
    }
    for rnd, k_index in enumerate(order, start=1):
        k = subkeys[k_index - 1]
        f_out, f_trace = feistel(right, k)
        new_right = xor_bits(left, f_out)
        trace["rounds"].append({
            "round": rnd,
            "key_index": k_index,
            "l_in": value(left),
            "r_in": value(right),
            "subkey": value(k),
            **f_trace,
            "f_output": value(f_out),
            "l_out": value(right),
            "r_out": value(new_right),
        })
        left, right = right, new_right

    preoutput = right + left  # final swap: R16 || L16
    out = permute(preoutput, T.IP_INV)
    trace["preoutput"] = value(preoutput)
    trace["output"] = value(out)
    trace["key_schedule"] = ks_trace
    return trace


def encrypt(block_hex, key_hex):
    """Return ciphertext hex for one block."""
    return des_trace(block_hex, key_hex)["output"]["hex"]


def decrypt(block_hex, key_hex):
    """Return plaintext hex for one block."""
    return des_trace(block_hex, key_hex, decrypt=True)["output"]["hex"]


# Known-answer vectors used by the lab ("Load test vector") and the tests.
TEST_VECTORS = [
    {"name": "Classic textbook example", "plaintext": "0123456789ABCDEF",
     "key": "133457799BBCDFF1", "ciphertext": "85E813540F0AB405"},
    {"name": "All zeros", "plaintext": "0000000000000000",
     "key": "0000000000000000", "ciphertext": "8CA64DE9C1B123A7"},
    {"name": "All ones", "plaintext": "FFFFFFFFFFFFFFFF",
     "key": "FFFFFFFFFFFFFFFF", "ciphertext": "7359B2163E4EDC58"},
    {"name": "Stallings textbook example", "plaintext": "02468ACEECA86420",
     "key": "0F1571C947D9E859", "ciphertext": "DA02CE3A89ECAC3B"},
    {"name": "Encrypts to zero", "plaintext": "8787878787878787",
     "key": "0E329232EA6D0D73", "ciphertext": "0000000000000000"},
    {"name": "NIST variable plaintext (bit 1)", "plaintext": "8000000000000000",
     "key": "0101010101010101", "ciphertext": "95F8A5E5DD31D900"},
]
