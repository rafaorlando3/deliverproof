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
- Follow-up edits affect documentation/runtime metadata only; executable code and
  tests match the tested commit. A fresh cloud npm ci with the reviewed lockfile
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

## Required next

1. M2: minimal Next.js workflow, independent expected-deployment/event verification,
   synthetic-file delivery workflow and reusable scaffold manifest.
2. Fresh locked install, frontend type/lint/build and smoke tests in the cloud.
3. Real testnet and public IPFS path with applicable account/credential authorization;
   evidence for deposit, approval, credit, withdrawal and refund, including units.
4. Clean npm create scaffold-hbar installation against an eventual authorized public
   repository; exact pinned dependencies, documentation, and acceptance evidence.
5. Competition eligibility, fresh competitor check, video and submission authorization.

No public repo, deployment, paid service, production money or competition submission.
Cloud logs and independent review support M1 progress, not competition readiness.
