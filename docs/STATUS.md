# Status — 2026-09-28

## M1 source and cloud review

- Solidity agreement, exact funding, single submission, commitment-bound approval,
  voluntary/timeout refund, per-agreement credit withdrawal and reentrancy guard.
- CAR block hashing and UnixFS reconstruction, domain commitment and tinybar/RPC conversion.
- Initial source f9cfe50: Claude reported type checking passed, core 15/16,
  contract 19/19. The failed UnixFS test constructed a CAR with the wrong codec;
  the verifier correctly rejected it as missing the requested root block.
- Reviewed and integrated Claude commits through 6bf43b5: npm lockfile, corrected
  recording fixture plus a negative regression test, three independent contract tests.
- Supplied cloud logs on 6bf43b5: core 17/17 and contract 22/22; type check passed.
  Six cross-language commitment cases matched Solidity and viem. A fixed-seed
  220-step sequence exercised approved/refunded/withdrawn outcomes and accounting.
- Codex checked package hashes, source delta, log totals and integrated the exact
  commits. No project, test, compiler or installer was run on the Mac.
- At M1 acceptance, follow-up edits affected documentation/runtime metadata only;
  M1 executable code and tests matched the tested commit. M2 changes are separate. A fresh cloud npm ci with the reviewed lockfile
  remains an installation check; the reported first run used npm install.

## Decisions from review

1. Use validated Node 22.22.2/npm 10.9.7. Minimum supported Node 22.18 for direct
   TS imports; Node 24 allowed but not exercised. Lockfile root metadata agrees.
2. Keep inclusive funding/submission boundary in the documented protocol. UI must
   expose remaining chain time and require usable margin, without promising inclusion.
3. Explain before participation: silence never pays the supplier; after review
   deadline the buyer can refund even a submitted delivery. No dispute arbitration.
4. tinybar/weibar behavior remains a Hedera testnet gate. Local EVM success does
   not prove deposit/withdraw conversion on chain 296.
5. Cloud reviewer/CI must record core and contract runs independently. npm test
   keeps fail-fast behavior; its short-circuit is explicit, not a full-suite result.

## M2a independent review received (not testnet)

- Claude supplied 15 hashed artifacts for 7f4c383 + review 84f1fec: clean npm ci,
  core 30/30, contract 22/22, chain/ABI 34/34 on an ephemeral cloud Hardhat node.
  Ten check-removal mutations were caught. Codex checked hashes/delta/log totals.
- Integrated that test-only review as de5e39f over M2b, resolving the root scripts
  conflict by keeping both the frontend scripts and chain:test. No local execution.
- This is evidence for M2a, not for the subsequent frontend or M2c changes.

## M2 source increment (frontend cloud validation pending)

- M2a commit 7f4c383: independent deployment/code/receipt/event/state verifier and
  13 written tests. Package delivered to Claude through X-0030. No execution here.
- M2b: original Next.js interface, core exports, browser-local CAR preparation and
  tests, scaffold manifest, guarded explicit deploy script and operator/cloud guides.
- UI covers create/deposit/submit/verify/approve/refund/withdraw, explicit wallet
  confirmation, shared-terms hash, policy acknowledgement, verified-byte download,
  public observation export and invalidation on account/network/agreement changes.
- The default deployment manifest remains null. No public contract or invented hash.
- Root workspace/dependency metadata now includes the frontend. The existing M1
  lockfile is intentionally preserved as historical input; **M2 npm ci is not ready
  until the cloud reviewer generates and returns a reviewed lockfile**.
- This frontend has not been run, rendered or built on the Mac. Source inspection
  and packaging do not prove compilation, layout quality or successful workflow.
- The deploy utility writes a public candidate only after receipt/runtime checks;
  installing it is a separate operator review. It has not been executed here.

## M2c correction increment — written, pending cloud acceptance

- Read event history in consecutive inclusive windows limited by real block
  timestamps (six-day maximum). No estimated block cadence. Caps: 64 log requests,
  256 timestamp reads, 256 aggregate events and 60 seconds between operations.
  In-flight requests retain the transport's 15s cap. An incomplete read is discarded
  as inconclusive, never accepted as proof of missing events or successful payment.
- Added the 14 contract errors and typed UnknownAgreement recognition. A transport
  failure whose text mentions the error is still a transport failure.
- Real forwarding-contract events are inconclusive/unsupported_caller only after
  successful canonical receipt membership checks. Direct EOA callers remain the
  supported model; no general smart-wallet support is claimed.
- Test helper drains Hardhat output without logging development private keys,
  bounds its readiness buffer, and terminates the child on startup failure/timeout.
- Sixteen unit regressions written plus an eight-day real EVM time-gap regression
  and updated ABI/negative chain expectations. None executed on the Mac.
- Browser preflight currently uses client.call; cloud UI acceptance must also check
  named revert presentation. ABI parity alone does not prove friendly UI errors.

## M2d deployment-recovery increment — written, pending cloud acceptance

- Static review found that candidate-only guarding allowed an operator to rerun
  deploy after a submitted transaction timed out, because no candidate existed yet.
- Before any possible send, the utility now reserves a durable, exclusive public
  attempt journal with sender/nonce/code context. Existing intent blocks new sends,
  including prepared intent after an interrupted/unknown result. No secret or signed
  transaction is stored; the guard is limited to this checkout and preserved files.
- Explicit recovery only reads the existing transaction and validates its original
  context before writing a candidate. It does not instantiate a signer or wallet.
- Seventeen journal/CLI regression cases written using a temporary filesystem and
  injected provider. None run here; actual cloud EVM rehearsal is still requested.
- No contract, wallet UI, dependency versions or deployment authorization changed.

## Required next

1. Claude cloud validation of M2b/M2c/M2d, updated lifecycle/ABI tests, reviewed
   lockfile and fresh npm ci, frontend lint/types/build and desktop/mobile rehearsal.
2. Official CLI local-template transformation plus clean generated build in cloud.
3. Actual Hedera testnet and public IPFS path after specific account/faucet/pinning
   authorization; verify deposit/credit/withdraw/refund and tinybar/weibar behavior.
4. Clean external-template installation from an authorized public repository;
   do not substitute a local template test for that public distribution proof.
5. Competition eligibility, fresh competitor check, video and submission authorization.

No public repo, deployment, paid service, production money or competition submission.
Cloud logs support M1 and the reviewed M2a boundary, not frontend/M2c/M2d or competition readiness.
