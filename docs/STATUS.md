# Verification status

Last reviewed: 2026-09-29. This page separates completed public evidence from pending checks. Both agreement paths and public IPFS retrieval have confirmed evidence below. Live HCS and the verifier export remain pending; a submitted or failed run alone is not a successful proof.

## Source template

- Repository: https://github.com/rafaorlando3/deliverproof, commit `717442e78e4c406e70bda79acf61274fcb74aee9`.
- Fresh install through the official CLI, `npm create scaffold-hbar@latest -- --template rafaorlando3/deliverproof`, on a GitHub-hosted runner: [run 36600616548](https://github.com/rafaorlando3/deliverproof/actions/runs/36600616548). It covers install, lint with zero warnings, type check, build, the three test suites and a production start on 127.0.0.1 that answers 200.

| Suite | Command | Result |
| --- | --- | --- |
| Core (vitest) | `npm run core:test` | 113 passed, 1 skipped |
| Contract (Hardhat) | `npm run hardhat:test` | 38 passed |
| Chain (vitest and a local node) | `npm run chain:test` | 46 passed |

The run above used source 717442e78e4c406e70bda79acf61274fcb74aee9, Node 22.22.2 and npm 10.9.7. Later source changes require a new recorded validation. The boot check covers HTTP responses only. The automated suites include local-chain, fixture and offline checks; they do not establish live wallet acceptance, Filebase/IPFS availability or HCS transmission. The skipped core test is an opt-in live mirror test, not a live-network success. Completed testnet evidence is limited to the rows explicitly linked below.

## Hedera testnet

The template ships with `packages/nextjs/lib/deployment.json` set to `null`. Testnet runs happen in a separate copy, https://github.com/rafaorlando3/deliverproof-testnet-proof, whose GitHub environment requires a reviewer to approve every run. Private keys and the Filebase token are held only as protected GitHub environment secrets; no secret value is versioned.

| Evidence | Link |
| --- | --- |
| Contract deployment | Contract `0.0.10781121` (`0x0b8329d55FfA4Fb7c55Cc9e83de1d40cD966B8CB`), [transaction on Hashscan](https://hashscan.io/testnet/transaction/0x5eeeb8fd700bbc15fe538495a804e6048b40024fb83b0c0807738d573cfdd227), block 41147455 |
| Agreement 1: exact deposit, delivery commitment, approval and supplier withdrawal | Confirmed, blocks 41151563 to 41151576: [create](https://hashscan.io/testnet/transaction/0x189592885e9552b49216c293ab14a08b09c8c270221cad6ae5a1733feeabc532), [deposit](https://hashscan.io/testnet/transaction/0xaedc448179ac2a4cddd997e2ef9811410dc2d383360da9a72523d182b3a6b457), [submit](https://hashscan.io/testnet/transaction/0x176d23d3bca0fb0f80cd44e106d0e3e048be9994bc965e39e615f9912085307a), [approve](https://hashscan.io/testnet/transaction/0x4c683f724872cc56633d1679590d0645c96edc5af23ce5bf25f466eb127f94a1), [withdraw](https://hashscan.io/testnet/transaction/0x848ba756e9046af24bc7b7df8790f2e9100123378eff63ab747d66aa60fe1707) |
| Agreement 2: refund after the review deadline and buyer withdrawal | Confirmed: [create](https://hashscan.io/testnet/transaction/0x4899bf3759415a0d81f1361c67c4de4722b9ea418a46cb43e2accc7d68d54f97), [deposit](https://hashscan.io/testnet/transaction/0xae11b725a25a77c7e4b473197c06efb4ad024a17475ad63844cb449fd50446a1), [refund](https://hashscan.io/testnet/transaction/0x14660c459c7d79d6f3612d5234aab3bbab99d192dbd14a83eabcf39df2e93411), [withdraw](https://hashscan.io/testnet/transaction/0x9e739a18ce4ebf3de402684ed267c9b3d1659db5384080547a83ad9567324930) |
| Delivered file on IPFS: CAR and public gateway retrieval matching the recorded CID | Confirmed: CID recomputed from the on-chain SHA-256; [CAR from ipfs.io](https://ipfs.io/ipfs/bafkreicmidb4okorv4g457l5pfygk6okbrbsgh2wtrj6qy3m645os7tjva?format=car) |
| HCS evidence topic, read from the mirror node | Pending |
| Verifier export for both agreements | Pending |
| Contract source verified on Hashscan | Pending (optional) |

The [proof workflow run 36636649271](https://github.com/rafaorlando3/deliverproof-testnet-proof/actions/runs/36636649271) completed the same two-agreement proof after reconciling the saved state. Earlier confirmed transactions were not repeated.

## Known limits

- Testnet only. Each agreement holds at most 10 test HBAR.
- Byte verification proves the file matches the recorded commitment. It does not prove authorship, quality or when the recipient obtained the file.
- ESLint 9.39.5 is a temporary unsupported development-tool exception. The attempted ESLint 10.11.0 upgrade failed with eslint-plugin-react 7.37.5 in the recorded cloud validation. Preserve effective React lint rules until a compatible supported configuration is independently validated; this exception does not authorize paid support or imply production readiness.

## History

The [previous validation log at source 717442e](https://github.com/rafaorlando3/deliverproof/blob/717442e78e4c406e70bda79acf61274fcb74aee9/docs/STATUS.md) preserves earlier review results and their exact-source limits. Node 20 and 24 results in that history are not a current gate for later changes.
