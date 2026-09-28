# DeliverProof

Verify the delivered bytes. Approve that exact version. Withdraw separately.

**Work in progress — milestone M1, not deployed, not executed on the author's Mac,
not ready for submission.** This first package implements a bounded testnet
escrow contract and independent file-verification primitives for cloud review.
See [status and remaining gates](docs/STATUS.md).

A buyer creates immutable terms and deposits the exact test-HBAR amount. A
supplier records one final IPFS delivery. An independent reader checks every
CAR block, reconstructs the UnixFS file and compares its SHA-256 and size.
Only explicit buyer approval of that exact commitment releases supplier credit.
A separate withdrawal confirms transfer. Silence never releases funds.

This proves correspondence of bytes and recorded wallet actions, not quality,
authorship, civil identity or production suitability. All demonstration files
must be public synthetic data. A CID is not a promise of persistent availability.

## Cloud-only M1 check

Use Node 22.14+ or Node 24 and npm. Current owner restriction: do not run on his Mac.

```
npm install --ignore-scripts
npm run check
npm test
```

These commands are **instructions for the cloud reviewer**, not claimed results.
The first cloud run must produce and review a lockfile. Solidity uses a pinned
registry compiler with no testnet account, faucet, secret, deployment or paid RPC.
Plain EVM tests use raw accounting units. Real Hedera unit behavior is a later gate.

## Components

- `packages/hardhat/contracts/DeliverProof.sol`: no admin, upgrades, fees or arbitrator.
- `packages/core/src/delivery.ts`: domain-separated commitment and explicit HBAR conversion.
- `packages/core/src/content.ts`: bounded CAR/DAG verifier; fixed trustless gateway choices.
- `packages/core/src/receipt.ts`: strict transaction-observation primitive, not yet a full receipt verifier.
- `docs/PROTOCOL.md`: immutable terms, deadlines, accounting, trust boundaries.

Next milestone: minimal Next.js workflow, explicit wallet review, read-only network
verification, testnet proof and clean external-template installation. This M1
package does not yet expose a working frontend or runnable scaffold manifest.
No HCS/indexer, marketplace, real funds, arbitration or multiple milestones.

## License and provenance

MIT. Original DeliverProof source. Scaffold-HBAR's official blank template and
CLI were inspected to align package paths and the external-template contract;
no competitor source was incorporated. [Sources](docs/SOURCES.md).
