# CipherBreak EDU lesson design

Each machine has a concept explanation, animated worked example and checkable practice signal. Guided mode requires successful practice before the randomly generated mission task. Challenge mode opens the mission task directly, with the lesson available for replay. The notebook keeps the explanations available.

| Operation | Objective | Worked example and guided check | Independent evidence |
| --- | --- | --- | --- |
| ASCII relay | LO1 · Encode bytes | Follow the first card character through decimal, binary and hex. Convert the second character. | Assemble all eight bytes into the exact hex block. |
| Block width | LO1 · Count bits | Convert a two-byte example to bits and hex digits. Convert the width of five bytes. | Identify the width of the mission block. |
| IP switchboard | LO1 · Rearrange bits | Watch a three-position map route three toy bits. Identify one source. | Route one actual IP output channel to its source. |
| Initial registers | LO1 · Split a block | Split a worked block at eight digits and identify a toy right register. | Identify both mission registers. |
| Key bank | LO2 · Distinguish parity and key strength | Remove every eighth bit in a small example. Count the remaining bits in four bytes. | Identify the effective width of the illustrated 64-bit key. |
| PC-1 | LO3 · Select and reorder key bits | Trace a four-bit input through a three-position selection. | Identify the source of an actual PC-1 output bit. |
| Key registers | LO3 · Split a 56-bit selection | Split fourteen hex digits into two groups of seven. Identify a toy C₀. | Identify the first two mission key registers. |
| Rotation disks | LO3 · Wrap shifted bits | Move the first two bits to the end of a five-bit example. Shift a different example by one. | Use the real schedule and rotate C and D. |
| PC-2 | LO3 · Select round-key bits | Join two toy registers and trace three selected positions. | Route a position through the real PC-2 map. |
| Subkey verification | LO3 · Read a 48-bit key | Convert binary nibbles to hex while preserving a leading zero. | Convert the computed PC-2 output into a 12-digit subkey. |
| Expansion E | LO4 · Repeat boundary bits | Expand a four-bit toy input by duplicating two positions. | Route one output channel through the real expansion map. |
| Round-key XOR | LO4 · Mix the expanded right signal | Compare four toy bit pairs. XOR a second toy input. | Enter the XOR result for the selected actual operand bits. |
| S-box array | LO5 · Calculate row and column | Separate the outer and middle bits, look up S1, and calculate row and column for another input. | Enter both calculated indices and select their intersection in the actual S-box. |
| P router | LO4 · Rearrange substituted bits | Follow a four-position map and identify an input. | Route one actual P output channel. |
| Feistel XOR | LO4 · Compute the new right half | XOR two hex nibbles and work a second example. | Compute the XOR of the displayed low bytes from old L and P. |
| Register update | LO4 · Apply the Feistel equations | Follow a toy round and compute its new L and R. | Enter both eight-digit mission registers. |
| Decryption key order | LO6 · Reverse the key schedule | Reverse a three-subkey schedule and identify the first key for five rounds. | Identify the reverse application order for the real DES subkeys. |
| First decryption round | LO6 · Reuse the circuit | Copy a toy right register to new L; repeat with hex input. | Identify the first new L after IP on the mission ciphertext. |
| Plaintext recovery | LO6 · Decode decrypted bytes | Decode a three-byte worked example, then decode another. | Recover the eight-character mission access code. |
| Security verdict | LO7 · Evaluate suitability | Compare the candidate-key counts of toy ciphers. | Reject single DES for sensitive data because 56-bit keys can be searched exhaustively. |

The toy check uses a known expected result. The independent check uses the seeded DES result or the mathematically correct choice for the operation. An incorrect submission explains the applicable rule and keeps the current machine locked. Hints progress from concept to example to procedure. Each operation records success, mistakes, and hints against its learning objective. A verified independent answer lights its machine and advances the task. The final required operation unlocks the door. The reactor’s bonus S-box applies the same criterion to a different actual input.

The signed-in classroom edition records attempt data and formative pre/post assessments. Classroom exports and dashboards describe observed responses, with no claim of measured learning improvement. The public presentation edition stores attempts locally and uses the same learning objectives. The two editions use separate save stores.
