"""Single-block DES and its teaching trace, following FIPS PUB 46-3."""
import re

IP = (
    58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
    62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
    57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
    61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
)
IP_INVERSE = tuple(IP.index(bit) + 1 for bit in range(1, 65))
PC1 = (
    57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
    10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
    63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
    14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
)
PC2 = (
    14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4,
    26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40,
    51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
)
E = (
    32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11,
    12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21,
    22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
)
P = (
    16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
    2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
)
SHIFTS = (1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1)
# Each hex digit is one entry in its 16-column row.
S_BOXES = tuple(tuple(tuple(int(digit, 16) for digit in row) for row in box.split()) for box in (
    "E4D12FB83A6C5907 0F74E2D1A6CB9538 41E8D62BFC973A50 FC8249175B3EA06D",
    "F18E6B34972DC05A 3D47F28EC01A69B5 0E7BA4D158C6932F D8A13F42B67C05E9",
    "A09E63F51DC7B428 D709346A285ECBF1 D6498F30B12C5AE7 1AD069874FE3B52C",
    "7DE3069A1285BC4F D8B56F03472C1AE9 A690CB7DF13E5284 3F06A1D8945BC72E",
    "2C417AB6853FD0E9 EB2C47D150FA3986 421BAD78F9C5630E B8C71E2D6F09A453",
    "C1AF92680D34E75B AF427C9561DE0B38 9EF528C3704A1DB6 432C95FABE17608D",
    "4B2EF08D3C975A61 D0B7491AE35C2F86 14BDC37EAF680592 6BD814A7950FE23C",
    "D2846FB1A93E50C7 1FD8A374C56B0E92 7B419CE206ADF358 21E74A8DFC90356B",
))


def require_hex(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{16}", value):
        raise ValueError("Enter exactly 16 hexadecimal digits (0–9, A–F).")
    return value.upper()


def permute(value, positions, width):
    result = 0
    for position in positions:
        result = (result << 1) | ((value >> (width - position)) & 1)
    return result


def hx(value, width):
    return f"{value:0{width // 4}X}"


def rotate28(value, steps):
    return ((value << steps) | (value >> (28 - steps))) & ((1 << 28) - 1)


def key_schedule(key_hex):
    key = require_hex(key_hex)
    pc1 = permute(int(key, 16), PC1, 64)
    c, d = pc1 >> 28, pc1 & 0xFFFFFFF
    schedule = {"key": key, "pc1": hx(pc1, 56), "c0": hx(c, 28), "d0": hx(d, 28), "rounds": []}
    for number, shift in enumerate(SHIFTS, 1):
        c_before, d_before = c, d
        c, d = rotate28(c, shift), rotate28(d, shift)
        combined = (c << 28) | d
        schedule["rounds"].append({
            "number": number, "shift": shift, "c_before": hx(c_before, 28), "d_before": hx(d_before, 28),
            "c": hx(c, 28), "d": hx(d, 28), "combined": hx(combined, 56),
            "subkey": hx(permute(combined, PC2, 56), 48),
        })
    return schedule


def substitute(value):
    output = 0
    details = []
    for index, table in enumerate(S_BOXES):
        group = (value >> (42 - 6 * index)) & 63
        row = ((group >> 5) << 1) | (group & 1)
        column = (group >> 1) & 15
        result = table[row][column]
        output = (output << 4) | result
        details.append({
            "number": index + 1, "input": f"{group:06b}", "input_hex": hx(group, 8),
            "row": row, "column": column, "value": result, "output": f"{result:04b}",
            "output_hex": hx(result, 4),
        })
    return output, details


def trace_des(block_hex, key_hex, decrypt=False):
    block = require_hex(block_hex)
    schedule = key_schedule(key_hex)
    ip = permute(int(block, 16), IP, 64)
    left, right = ip >> 32, ip & 0xFFFFFFFF
    trace = {
        "input": block, "key": schedule["key"], "key_schedule": schedule,
        "direction": "Decryption" if decrypt else "Encryption", "ip": hx(ip, 64),
        "l0": hx(left, 32), "r0": hx(right, 32), "rounds": [],
    }
    keys = reversed(schedule["rounds"]) if decrypt else schedule["rounds"]
    for number, key in enumerate(keys, 1):
        expanded = permute(right, E, 32)
        mixed = expanded ^ int(key["subkey"], 16)
        substituted, sboxes = substitute(mixed)
        permuted = permute(substituted, P, 32)
        next_right = left ^ permuted
        trace["rounds"].append({
            "number": number, "key_number": key["number"], "key": key["subkey"],
            "l_in": hx(left, 32), "r_in": hx(right, 32), "expanded": hx(expanded, 48),
            "mixed": hx(mixed, 48), "sboxes": sboxes, "substituted": hx(substituted, 32),
            "permuted": hx(permuted, 32), "feistel_xor": hx(next_right, 32),
            "l_out": hx(right, 32), "r_out": hx(next_right, 32),
        })
        left, right = right, next_right
    preoutput = (right << 32) | left
    trace["preoutput"] = hx(preoutput, 64)
    trace["output"] = hx(permute(preoutput, IP_INVERSE, 64), 64)
    return trace


def encrypt(block, key):
    return trace_des(block, key)["output"]


def decrypt(block, key):
    return trace_des(block, key, decrypt=True)["output"]
