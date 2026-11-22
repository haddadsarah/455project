# CipherBreak EDU lesson design

Each room combines NOVA's explanations with machines that accept and assess actual DES operations. The tutorial can be opened again from a machine. Guided play provides examples and free hints. Challenge mode tracks missed answers and applies hint costs. Invalid formats receive feedback before any scoring change.

| Room | Machines and evidence | What becomes available |
| --- | --- | --- |
| Hex Gate | Collect the access card. Compose the hexadecimal block, inspect a selected byte as binary, route a mapped IP bit, and split the result into L₀ and R₀. | The 64-bit block, both halves and the door to the vault. |
| Key Vault | Mark all eight parity positions, route PC-1, split C₀ and D₀, rotate both registers, apply PC-2 and activate the key forge. | The 16-subkey archive with each previous and rotated half, the combined register, and the PC-2 result. |
| Round Reactor | Restore E connections, set individual XOR outputs, select the S-box row and column, encode the substitution bits, route P, and update the Feistel registers. Activate the round sequence and apply the final swap. | The encryption trace for all 16 rounds. The bonus S-box uses a second actual input. |
| Final Decryption Chamber | Reorder 16 subkey cartridges, apply a representative decryption round, decode the recovered plaintext and answer four security questions. | The reverse-key decryption trace, final exit, score and achievements. |

The game, laboratory and instructor demonstration get their values from `des_engine`. For independent assignments, revealing answers through the laboratory is recorded as assistance. The Django services validate actions, keep score, unlock machine dependencies and record submissions and hint use. Students can retake the mission with another seed. Instructors see results only for their classrooms.

The optional pre/post questions and instructor CSV document observed outcomes. The included local demo students are fictional. Scores in their reports come from simulated attempts run through the same game rules. No educational effectiveness study is represented.
