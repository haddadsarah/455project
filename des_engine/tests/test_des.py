"""DES engine tests: known-answer vectors, key schedule, round values, permutations,
S-boxes, decryption, validation. Runs with `python manage.py test` (no Django needed
by the engine itself)."""
import os
import random
import unittest

from des_engine import (DESInputError, TEST_VECTORS, decrypt, des_trace, encrypt, key_schedule,
                        permute, rotate_left, sbox_lookup, validate_hex64, xor_bits)
from des_engine import tables as T

try:  # optional independent cross-check (only used in tests, never by the app)
    from Crypto.Cipher import DES as RefDES
except ImportError:  # pragma: no cover
    RefDES = None


class KnownAnswerTests(unittest.TestCase):
    def test_classic_vector(self):
        self.assertEqual(encrypt("0123456789ABCDEF", "133457799BBCDFF1"), "85E813540F0AB405")

    def test_all_zero(self):
        self.assertEqual(encrypt("0000000000000000", "0000000000000000"), "8CA64DE9C1B123A7")

    def test_all_vectors_encrypt_and_decrypt(self):
        for v in TEST_VECTORS:
            with self.subTest(v["name"]):
                self.assertEqual(encrypt(v["plaintext"], v["key"]), v["ciphertext"])
                self.assertEqual(decrypt(v["ciphertext"], v["key"]), v["plaintext"])

    def test_round_trip_random(self):
        rng = random.Random(455)
        for _ in range(200):
            p = format(rng.getrandbits(64), "016X")
            k = format(rng.getrandbits(64), "016X")
            self.assertEqual(decrypt(encrypt(p, k), k), p)

    @unittest.skipIf(RefDES is None, "pycryptodome not installed")
    def test_matches_independent_library(self):
        for _ in range(300):
            k, p = os.urandom(8), os.urandom(8)
            self.assertEqual(encrypt(p.hex(), k.hex()), RefDES.new(k, RefDES.MODE_ECB).encrypt(p).hex().upper())


class KeyScheduleTests(unittest.TestCase):
    # Published round keys for key 133457799BBCDFF1 (J. Orlin Grabbe, "The DES Algorithm Illustrated").
    EXPECTED = ["1B02EFFC7072", "79AED9DBC9E5", "55FC8A42CF99", "72ADD6DB351D", "7CEC07EB53A8",
                "63A53E507B2F", "EC84B7F618BC", "F78A3AC13BFB", "E0DBEBEDE781", "B1F347BA464F",
                "215FD3DED386", "7571F59467E9", "97C5D1FABA41", "5F43B7F2E73A", "BF918D3D3F0A", "CB3D8B0E17F5"]

    def test_all_16_round_keys(self):
        subkeys, trace = key_schedule("133457799BBCDFF1")
        self.assertEqual([r["subkey"]["hex"] for r in trace["rounds"]], self.EXPECTED)
        self.assertEqual(len(subkeys), 16)
        self.assertTrue(all(len(k) == 48 for k in subkeys))

    def test_pc1_and_halves(self):
        _, t = key_schedule("133457799BBCDFF1")
        self.assertEqual(t["pc1"]["bin"], "11110000110011001010101011110101010101100110011110001111")
        self.assertEqual(t["c0"]["bin"], "1111000011001100101010101111")
        self.assertEqual(t["d0"]["bin"], "0101010101100110011110001111")
        self.assertEqual(t["pc1"]["bits"], 56)

    def test_shift_schedule_and_cycle(self):
        _, t = key_schedule("133457799BBCDFF1")
        self.assertEqual([r["shift"] for r in t["rounds"]], T.SHIFTS)
        self.assertEqual(t["rounds"][-1]["total_shift"], 28)
        self.assertEqual(t["rounds"][-1]["c"]["bin"], t["c0"]["bin"])  # C16 == C0
        for r in t["rounds"]:
            self.assertEqual(r["c"]["bin"], rotate_left(r["c_prev"]["bin"], r["shift"]))
            self.assertEqual(r["cd"]["bin"], r["c"]["bin"] + r["d"]["bin"])

    def test_parity_bits_ignored(self):
        # Flipping only parity bits must not change any subkey.
        a, _ = key_schedule("133457799BBCDFF1")
        b, _ = key_schedule("123456789ABCDEF0")  # each byte's last bit flipped
        self.assertEqual(a, b)


class RoundTests(unittest.TestCase):
    def setUp(self):
        self.t = des_trace("0123456789ABCDEF", "133457799BBCDFF1")

    def test_ip_and_halves(self):
        self.assertEqual(self.t["ip"]["hex"], "CC00CCFFF0AAF0AA")
        self.assertEqual(self.t["l0"]["hex"], "CC00CCFF")
        self.assertEqual(self.t["r0"]["hex"], "F0AAF0AA")

    def test_round_one_intermediates(self):
        r = self.t["rounds"][0]
        self.assertEqual(r["expanded"]["bin"], "011110100001010101010101011110100001010101010101")
        self.assertEqual(r["xor"]["bin"], "011000010001011110111010100001100110010100100111")
        self.assertEqual(r["s_output"]["bin"], "01011100100000101011010110010111")
        self.assertEqual(r["f_output"]["bin"], "00100011010010101010100110111011")
        self.assertEqual(r["r_out"]["hex"], "EF4A6544")
        self.assertEqual(r["l_out"]["hex"], "F0AAF0AA")
        self.assertEqual([s["value"] for s in r["sboxes"]], [5, 12, 8, 2, 11, 5, 9, 7])

    def test_final_round_and_swap(self):
        last = self.t["rounds"][-1]
        self.assertEqual(last["l_out"]["hex"], "43423234")
        self.assertEqual(last["r_out"]["hex"], "0A4CD995")
        self.assertEqual(self.t["preoutput"]["hex"], "0A4CD99543423234")
        self.assertEqual(self.t["output"]["hex"], "85E813540F0AB405")

    def test_every_round_follows_feistel_rule(self):
        for r in self.t["rounds"]:
            self.assertEqual(r["l_out"]["bin"], r["r_in"]["bin"])
            self.assertEqual(r["r_out"]["bin"], xor_bits(r["l_in"]["bin"], r["f_output"]["bin"]))
            self.assertEqual(r["xor"]["bin"], xor_bits(r["expanded"]["bin"], r["subkey"]["bin"]))
            self.assertEqual(r["p_output"]["bin"], permute(r["s_output"]["bin"], T.P))
            self.assertEqual(len(r["sboxes"]), 8)

    def test_decryption_uses_reverse_key_order(self):
        c = self.t["output"]["hex"]
        d = des_trace(c, "133457799BBCDFF1", decrypt=True)
        self.assertEqual(d["key_order"], list(range(16, 0, -1)))
        for i, r in enumerate(d["rounds"]):
            self.assertEqual(r["subkey"]["hex"], self.t["rounds"][15 - i]["subkey"]["hex"])
        self.assertEqual(d["output"]["hex"], "0123456789ABCDEF")


class PrimitiveTests(unittest.TestCase):
    def test_sbox_lookup_example(self):
        s = sbox_lookup(0, "011011")
        self.assertEqual((s["row"], s["col"], s["value"], s["output"]), (1, 13, 5, "0101"))

    def test_sboxes_are_permutations_of_0_15(self):
        for box in T.SBOXES:
            for row in box:
                self.assertEqual(sorted(row), list(range(16)))

    def test_ip_inverse(self):
        bits = format(random.Random(1).getrandbits(64), "064b")
        self.assertEqual(permute(permute(bits, T.IP), T.IP_INV), bits)

    def test_table_sizes(self):
        self.assertEqual((len(T.IP), len(T.E), len(T.P), len(T.PC1), len(T.PC2)), (64, 48, 32, 56, 48))
        self.assertFalse(set(T.PARITY_BITS) & set(T.PC1))

    def test_rotate(self):
        self.assertEqual(rotate_left("1011000", 1), "0110001")
        self.assertEqual(rotate_left("1011000", 2), "1100010")


class ValidationTests(unittest.TestCase):
    def test_leading_zeros_preserved(self):
        self.assertEqual(validate_hex64("00000000000000ab"), "00000000000000AB")
        out = encrypt("0000000000000001", "0101010101010101")
        self.assertEqual(len(out), 16)
        self.assertEqual(decrypt(out, "0101010101010101"), "0000000000000001")

    def test_spaces_allowed(self):
        self.assertEqual(validate_hex64("0123 4567 89AB CDEF"), "0123456789ABCDEF")

    def test_bad_inputs(self):
        for bad, word in [("", "missing"), (None, "missing"), ("0123", "16"), ("0123456789ABCDEF00", "16"),
                          ("0123456789ABCDEG", "non-hexadecimal"), ("0x23456789ABCDEF", "non-hexadecimal")]:
            with self.subTest(bad=bad):
                with self.assertRaises(DESInputError) as ctx:
                    validate_hex64(bad, "message")
                self.assertIn(word, str(ctx.exception))
        with self.assertRaises(DESInputError):
            encrypt("0123456789ABCDEF", "1234")
