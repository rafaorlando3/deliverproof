# Status — 2026-09-28

## M1 source and cloud review

- Solidity agreement, exact funding, single submission, commitment-bound approval,
  voluntary/timeout refund, per-agreement credit withdrawal and reentrancy guard.
- CAR block hashing and UnixFS reconstruction, domain commitment and tinybar/RPC conversion.
- Initial source f9cfe50: Claude reported type checking passed, core 15/16,
  contract 19/19. The failed UnixFS test constructed a CAR with the wrong codec;
  the verifier correctly rejected it as missing the requested root block.
- Reviewed and integrated Claude commits through 6bf43b5: package lockfile, corrected
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

1. Use validated Node 22.22.2/npm@10.9.7. Minimum supported Node 22.18 for direct
   TS imports; Node 24 allowed but not exercised. Lockfile root metadata agrees.
2. Keep inclusive funding/submission boundary in the documented protocol. UI must
   expose remaining chain time and require usable margin, without promising inclusion.
3. Explain before participation: silence never pays the supplier; after review
   deadline the buyer can refund even a submitted delivery. No dispute arbitration.
4. tinybar/weibar behavior remains a Hedera testnet gate. Local EVM success does
   not prove deposit/withdraw conversion on chain 296.
5. Cloud reviewer/CI must record core and contract runs independently. npm run test
   keeps fail-fast behavior; its short-circuit is explicit, not a full-suite result.

## M2a independent review received (not testnet)

- Claude supplied 15 hashed artifacts for 7f4c383 + review 84f1fec: clean npm ci,
  core 30/30, contract 22/22, chain/ABI 34/34 on an ephemeral cloud Hardhat node.
  Ten check-removal mutations were caught. Codex checked hashes/delta/log totals.
- Integrated that test-only review as de5e39f over M2b, resolving the root scripts
  conflict by keeping both the frontend scripts and chain:test. No local execution.
- This is evidence for M2a, not for the subsequent frontend or M2c changes.

## M2 source increment and reviewed M2b cloud evidence

- M2a commit 7f4c383: independent deployment/code/receipt/event/state verifier and
  13 written tests. Package delivered to Claude through X-0030. No execution here.
- M2b: original Next.js interface, core exports, browser-local CAR preparation and
  tests, scaffold manifest, guarded explicit deploy script and operator/cloud guides.
- UI covers create/deposit/submit/verify/approve/refund/withdraw, explicit wallet
  confirmation, shared-terms hash, policy acknowledgement, verified-byte download,
  public observation export and invalidation on account/network/agreement changes.
- The default deployment manifest remains null. No public contract or invented hash.
- Root workspace/dependency metadata includes the frontend. The reviewed M2
  lockfile from 42ee818 is now integrated: 446 to 823 package entries, 377 added,
  none removed. Four existing dependency entries change only dev/devOptional
  classification; versions/resolved/integrity of existing dependencies are unchanged.
  The root workspace metadata also changes. Workspace links have no registry
  integrity by design; new registry packages carry integrity metadata.
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

## M2b acceptance boundary (C-0044)

- Independently checked all 26 package hashes, Git bundle integrity, dependency
  fields, source patches and supplied log totals. Six loose screenshots were
  recompressed in transfer; original captures remain in the hashed archive.
- Supplied clean cloud logs on **42ee818**: core 32/32, contract 22/22, chain/ABI
  41/41; types, lint and full Next build passed. Lint retains one cleanup-ref
  warning; zero lint errors does not mean zero warnings.
- Browser rehearsal records 56/56 checks: real ephemeral cloud-local EVM,
  approval/withdrawal and both refund paths. IPFS retrieval was simulated only in
  the harness. Desktop/375px captures support layout observations, not testnet.
- Normal official CLI 0.4.0 generation and a clean locked build of its output
  passed with the known format warning and metadata/text transformations recorded
  in INSTALL.md. Local-template override is not public external-template proof.
- Integrated lock, lint dependency compatibility, Next Link/config, generated
  declarations and seven independent chain regressions. The existing M2a suite
  was not duplicated. Rejected estimated fixed-block pagination in favor of the
  existing timestamp-bounded M2c implementation. Combined result is untested.
- **ESLint 9.39.5 is an explicit temporary unsupported development-tool exception.**
  ESLint 10.11.0 crashed eslint-plugin-react 7.37.5 in the supplied cloud run.
  Keep effective React lint rules while preparing a separately validated
  compatible supported configuration. ESLint 9 reached EOL on 2026-08-06;
  official source checked 2026-09-28: https://eslint.org/version-support/ .
  This exception does not authorize paid support or imply production readiness.
- **UI-01 is still open**: a send/receipt timeout or context change can lose the
  original transaction hash and allow another create. Claude is preparing a
  red/green reproduction and separate fix. The 56-check rehearsal did not close it.

## M2e content-work bound — written, pending cloud acceptance

- Static review found that the 512-block cap counted distinct stored CIDs, while
  repeated CAR records still consumed decode/hash work. The complete reader also
  indexed all records before that cap was checked. The 4 MiB input cap still held;
  no browser stall or incident was observed and no timing claim is made.
- The source now uses the existing dependency's progressive CarBlockIterator and
  counts all records, including duplicates, before hashing each admitted record.
  Up to 512 records are allowed; excess is inconclusive/block_limit. Every admitted
  duplicate still needs a matching hash, and all original DAG/content checks remain.
- Three regression cases written: 512 repeated records preserve verified bytes;
  513 repeated records under the byte cap are inconclusive; a later repeated CID
  with corrupted bytes is a hash mismatch. Not executed on the Mac. Claude must
  demonstrate the failing old case and passing corrected case in the cloud, then
  run core/type/build checks and browser CAR preparation/retrieval in the combined
  checkout. No new dependency, wallet/UI change, network access or upload added.

## Required next

1. Claude cloud validation of the combined M2c/M2d/M2e corrections and UI-01 fix:
   untouched baseline, reviewed deltas, fresh locked installation, core/contract/
   chain and frontend checks, actual crash/timeout/recovery and browser scenarios.
2. Real format script with reviewed dependencies; repeat normal CLI generation,
   inspect text/manifest/lock changes and repeat clean generated checks in cloud.
3. Actual Hedera testnet and public IPFS path after specific account/faucet/pinning
   authorization; verify deposit/credit/withdraw/refund and tinybar/weibar behavior.
4. Clean external-template installation from an authorized public repository;
   do not substitute a local template test for that public distribution proof.
5. Competition eligibility, fresh competitor check, video and submission authorization.

No public repo, deployment, paid service, production money or competition submission.
Cloud logs support M1, reviewed M2a and the exact M2b boundary on 42ee818. They do
not validate the combined corrections, real Hedera/IPFS or competition readiness.
