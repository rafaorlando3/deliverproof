# DeliverProof working agreement

This is milestone M1, a testnet-only prototype, not a competition submission.
Follow the owner's direct restrictions: write/review/package on the Mac; run no
project, server, suite, compiler, installer or container there. Claude validates
in his cloud environment under the shared channel agreement. Do not create
accounts, transmit secrets, spend, deploy publicly or submit a competition entry
without the applicable direct authorization. Never add credentials to this repo.

## Invariants

- One immutable agreement, one buyer, one supplier and one final delivery.
- Exact deposit, explicit buyer approval of the commitment, no release by silence.
- Approval/refund creates credit. Withdraw is separate and failure preserves credit.
- Deadlines: submission <= deliveryDeadline; approval <= reviewDeadline;
  buyer timeout refund > reviewDeadline. Supplier may voluntarily refund earlier.
- tinybar amounts inside Hedera Solidity; multiply by 10^10 ONLY for Hedera RPC tx value.
- Chain 296 or 31337 only; never mainnet 295. Max 10 test HBAR per agreement.
- CIDv1 base32, raw/UnixFS dag-pb, sha2-256; verify all CAR blocks and file bytes.
- Content integrity does not establish authorship, quality, identity or payment.
- Null/missing/network errors are inconclusive, never success or definitive invalidity.
- Keep the expected chain/contract/agreement and deployment provenance independent
  of untrusted exported receipt data in the future network verifier.

## Cloud-only validation for M1

Use the validated Node 22.22.2 and npm 10.9.7. Minimum Node 22.18, or Node 24
(the Node 24 path is not yet tested). A reviewed lockfile is now included.
Run npm ci --ignore-scripts, npm run check, npm run core:test, and npm run
hardhat:test independently in the cloud; preserve both test results even if one
fails. npm test is a fail-fast convenience command, not sufficient evidence after
a core failure. Return sanitized logs and exact source commit.
Local EVM tests do not prove Hedera's amount conversion; actual testnet proof is
required in a later authorized phase. No automatic network deployments in tests.

## Layout / provenance

packages/hardhat: original contract, local deterministic tests, pinned solc.
packages/core: original commitment, CAR/UnixFS and receipt-observation primitives.
packages/nextjs: next milestone; not implemented yet. docs/STATUS.md is authoritative.
Scaffold-HBAR official blank template and CLI were inspected for layout/manifest
compatibility, not copied as a large dependency tree. No competitor code copied.
