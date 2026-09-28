# DeliverProof

Verify the delivered bytes. Approve that exact version. Withdraw separately.

**M2 source written; cloud validation pending. Not deployed or submitted.**
The earlier M1 cloud review recorded 17 core and 22 contract tests passing on
`6bf43b5`. That result does not cover this new frontend/network increment.
See [current status and remaining gates](docs/STATUS.md).

DeliverProof is a small, original Scaffold-HBAR template for one buyer, one
supplier and one public synthetic deliverable. The buyer fixes the terms and
funds the exact test-HBAR amount. The supplier records one IPFS delivery. The
reader independently checks deployment provenance, event history, canonical
receipts and stored state at one block; file verification separately checks CAR
blocks, reconstructs the file and compares SHA-256, size and domain commitment.

Explicit buyer approval creates supplier credit. Actual withdrawal is a separate
transaction. **Silence never releases money:** after the review deadline the
buyer can reclaim the deposit even if a delivery was submitted. Both participants
must accept that policy; this prototype has no arbitration or quality judgment.

## What is included

- Original bounded Solidity contract: no admin, upgrades, protocol fee or arbiter.
- Domain-separated agreement/file commitments and explicit Hedera RPC unit conversion.
- Bounded offline CAR/UnixFS verification and fixed trustless gateway retrieval.
- Read-only network verifier anchored to an operator-reviewed deployment, never an
  uploaded receipt. Unavailable or incomplete history produces an inconclusive result.
- Minimal Next.js workflow: create, deposit, prepare a CAR, verify bytes, record,
  approve/refund and withdraw, with explicit wallet confirmation for each transaction.
- Public evidence export, download of verified bytes for review, exact shared-terms
  check, account/network-change invalidation and duplicate-action guard.
- Scaffold manifest, explicit deployment utility and cloud acceptance checklist.

The default manifest is null: no pretend contract or pre-funded wallet. Local CAR
preparation uploads nothing. Pinning and funded testnet activity require separate
operator authorization. Files must be public synthetic data, never customer data.

## Review and installation

[Installation and deployment guide](docs/INSTALL.md) ·
[Cloud M2 acceptance checklist](docs/VALIDATION-M2.md) ·
[Protocol](docs/PROTOCOL.md)

Node 22.22.2/npm 10.9.7 was the M1 review environment. Minimum Node 22.18;
Node 24 is allowed but untested. The existing lockfile covers M1; the cloud reviewer
must generate and review the M2 dependency lock, then prove a clean npm ci/build.
Do not run the project, compiler, installer, server or tests on the owner's Mac.

The `.candidate.json` deployment file contains only public provenance and must be
reviewed before installation. Testnet keys come only from protected process
environment and are never passed to the frontend or stored in this repository.
No deploy runs automatically from install/build/test/start.

## Evidence boundaries

Byte correspondence is not proof of quality, authorship or civil identity.
A CID does not guarantee availability. Approval-credit is not withdrawal.
A canonical RPC observation is not a cryptographic light client or guarantee
against future chain history changes. Local EVM tests do not prove Hedera's
Solidity tinybar versus RPC weibar behavior. Mainnet is not supported.

M2 still needs cloud validation, actual testnet/IPFS evidence, a public clean
scaffold install, final eligibility checks and separately authorized publication
and submission. No claim of competition readiness or prize is made.

MIT. Original source; official Scaffold-HBAR layout/manifest inspected for
compatibility. No competitor source copied. [Sources](docs/SOURCES.md).
