# M2 cloud acceptance — written, not executed on the Mac

First run the untouched commit and record all failures before proposing fixes.
Return patches/bundle to a new review folder; never edit Codex's working source.
Include sanitized exit statuses, exact source SHA, Node/npm versions and hashes.

## Core and ABI

- Run M1 tests plus network/artifact tests and type checking independently.
- Compare the handwritten ABI against compiled Solidity, including named tuple
  fields and indexed event fields. Add a parity regression, not an assertion that
  compares the ABI with a copy of itself.
- Run complete create/fund/submit/approve/credit/withdraw and both refund paths
  against a deployed ephemeral cloud EVM. Feed real receipts/events/state to the
  network reader, not just mocks. Credit is not withdrawal. Before/after terminal
  state must agree, including refund without submission.
- Add independent negative tests: terminal beneficiary/amount mismatch, wrong
  approval commitment, missing credit/withdrawal event, wrong event contract,
  same file in another agreement, wrong runtime/deployer, null receipt, changed
  canonical block, oversized history, unavailable RPC or gateway. None may report
  successful payment or successful content verification.

## Frontend and lifecycle

- Generate/review the M2 lockfile, then clean `npm ci`. Run core types, both suites,
  frontend lint/types/build separately. Check frontend declarations after build.
- With the null manifest: desktop and 375px mobile render without exceptions;
  wallet actions are disabled. No horizontal overflow, hidden actions or clipped
  CIDs. Keyboard focus and status announcements remain usable.
- With an independently checked cloud-local manifest: walk two unlocked test
  identities through creation, exact deposit, CAR preparation, byte verification,
  submission, approval and separate withdrawal. Check submitted hash versus
  confirmed receipt versus verifier result in each step. Record only public hashes.
- Use a deterministic synthetic CAR and, if needed, browser routing to serve that
  fixture in the **cloud rehearsal only**. Explicitly label mocked retrieval; it
  is not public IPFS or testnet evidence. Do not add mock RPC/gateway toggles to
  the shipped UI or weaken provenance/byte verification to make the demo green.
- Require exact shared terms and the explicit refund-policy acknowledgement before
  funding/submission/approval. Content integrity alone is not work acceptance.
- Wrong wallet network/account, disconnected wallet, rejected signature, reverted
  transaction and confirmation timeout leave truthful, recoverable states. Change
  account/chain while async verification is pending: no stale success/action.
- Double-clicking an action must not send two transactions; try a rapid duplicate
  click before React repaint. Agreement change invalidates file/proof context.
- Verify file bounds before reading, malformed CAR, mismatching CID/bytes, and
  unknown content. Download verified bytes as an attachment, never inject HTML.
- At expiry, buyer and supplier permissions match the contract. Fund is blocked
  near deadline. Refund credit can be withdrawn once only. Failed withdrawal
  preserves credit. No browser background polling, secret storage or auto-pin.

## Scaffold and deploy utility

- Validate the manifest with the official CLI's schema, exercise the local template
  override with Next.js/Hardhat/npm/testnet, and inspect generated workspace/scripts.
- Clean-install/build the generated output. Verify core exports and `.js` to `.ts`
  resolution under the actual Next webpack build; do not rely on tsc alone.
- Explicit cloud-local deployment creates a candidate only; default manifest stays
  null. Verify matching compiled runtime and canonical deployment receipt before
  installation. Existing candidate/deployment must stop a second deploy.
- No deployment triggered by install/build/test/start. Mainnet and wrong chain must
  be refused before sending. Private key only from protected environment on the
  separately authorized testnet flow. Do not print raw provider/signing exceptions.

Real chain 296, real public IPFS retrieval, funded testnet behavior, public scaffold
install, video and competition submission remain separate gates. Do not turn the
cloud-local rehearsal or a screenshot into evidence of those results.
