# Installation and operator guide

M2 source review package, not a published template. Do not run any of these
commands on the owner's Mac. Execution belongs in Claude's authorized cloud.
No installation, test or frontend command deploys, signs or pins anything.

## Reproducible installation gate

Use Node 22.22.2 and npm 10.9.7. The existing lockfile is the accepted **M1**
lockfile. This M2 source adds the frontend; a clean `npm ci` is **not yet ready**.
The cloud reviewer first records the untouched source SHA, generates the M2
lockfile using `npm install --ignore-scripts`, reviews the lock delta and returns
it as a patch. In a second clean checkout of that corrected commit, run:

```sh
npm ci --ignore-scripts
npm run check
npm run core:test
npm run hardhat:test
npm run next:lint
npm run next:check
npm run next:build
```

Run each independently and preserve its exit status. The aggregate `npm test`
uses fail-fast behavior; it is not sufficient evidence if core fails. Run the
frontend type check again after Next has generated its route declarations.
`next build` must produce a complete build, not merely a started process.

After an accepted cloud build, `npm run next:start` serves only the loopback
interface on port 3000. Development uses `npm run next:dev`. There are no remote
fonts, backend secrets or database. The stock deployment JSON is `null` and
the UI must remain useful as a disabled, clearly labelled source preview.

## Cloud-only local EVM rehearsal

The contract uses raw tinybar-equivalent accounting units on chain 31337.
These local values are **not** real Hedera currency behavior. Wallet gas and
native balance displays use 18 decimals on that EVM; do not infer HBAR payouts.
The frontend shows agreement amounts divided by 10^8 as HBAR-equivalents.

In an isolated cloud environment, compile with `npm run hardhat:compile`, start
the loopback node with `npm run hardhat:node`, and explicitly call
`npm run hardhat:deploy:local`. Keep deterministic development account keys out
of captured logs; Hardhat prints them at startup, so suppress that startup output.
Use unlocked loopback accounts for the rehearsal, never a personal wallet.

The deployment utility writes only a **candidate** public manifest after checking
the canonical successful receipt and the compiled runtime hash. It refuses a
pre-existing candidate/configured deployment instead of silently deploying again.
Review `packages/nextjs/lib/deployment.candidate.json`, verify the source/artifact,
then copy its public contents to `packages/nextjs/lib/deployment.json` in the
cloud rehearsal checkout. Rebuild/restart the UI after installing the manifest.
Do not return a cloud-local address as a usable public testnet deployment.

## Testnet deployment — separate authorization gate

No account, faucet, key, funded transaction or IPFS service has been configured
by this package. First obtain the owner's authorization for the concrete testnet
and pinning flow. Stop if a service requests payment or a card. Never use mainnet.

The explicit script `npm run hardhat:deploy:testnet` accepts only chain **296**
at the fixed public `https://testnet.hashio.io/api` endpoint. It requires
`DELIVERPROOF_TESTNET_AUTHORIZED=yes` and `DELIVERPROOF_TESTNET_PRIVATE_KEY` in
the runner's protected process environment. Do not place the key in command
arguments, shell history, dotenv, a repository, chat, screenshots or logs.
The script never reads dotenv and intentionally suppresses raw library errors.
No key is passed to or embedded in the frontend. Clear the runner environment
afterward. The owner reviews and installs the resulting public candidate manifest.

A submitted hash is not a completed deployment. An interrupted/failed wait must
be investigated by its public transaction hash before any retry. Acceptance
requires actual testnet proof of exact funding, approval-credit, withdrawal and
refund, including tinybar (Solidity) versus 18-decimal RPC value. A local EVM
pass cannot close this gate. Gateway/RPC availability and historical block reads
must be checked on the real selected provider; the verifier fails inconclusively
when history is incomplete or unavailable.

## Workflow and file availability

1. Buyer creates immutable terms, a different supplier, exact amount up to 10
   test HBAR, and two future deadlines. Save/share the exact UTF-8 terms text.
2. Either participant can read agreement evidence without a wallet. Paste the
   shared terms and check the hash. Buyer explicitly deposits the exact amount.
3. Supplier selects **one public synthetic file** (1 byte to 1 MiB) and its declared
   media type. Preparation creates a raw CIDv1 CAR locally. It uploads nothing.
4. Download that CAR. Pin it using a separately authorized IPFS tool. Generic file
   upload to a pinning provider may re-encode it as UnixFS and change the CID;
   use CAR import preserving the root. Then retrieve and verify the exact CID.
5. Supplier records the delivery only after its retrieved bytes verify. Buyer
   independently verifies network history and file bytes, downloads the verified
   bytes for content review, then explicitly approves the recorded commitment.
6. Approval creates supplier credit. Withdrawal is another signed transaction.
   Only its canonical successful receipt and matching event establish withdrawal.
7. Supplier may voluntarily refund; buyer may refund strictly after the review
   deadline. A refund creates buyer credit, which also needs withdrawal.

Both sides acknowledge: silence does not release funds, and the buyer can reclaim
the deposit after the review deadline **even if a file was submitted**. There is
no arbitration or automatic assessment of work quality. Deadlines use chain time;
UI funding requires 60 seconds of margin, without guaranteeing inclusion.

An offline CAR can verify recorded content when a gateway is unavailable. That
does not prove public IPFS availability. Never label a failed/partial fetch as
invalid work or success. Exported evidence JSON is a record of observations;
it cannot change the trusted deployment and is not proof of future availability.

## External Scaffold-HBAR template gate

`template.json` declares Next.js + Hardhat + npm and the custom core workspace.
The official CLI's local template override (`CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR`)
can exercise copy/normalization in the cloud before a public repository exists.
Record CLI version/commit and exact command, inspect generated package scripts,
then repeat the clean locked build in the generated directory. Do not assume
direct checkout success proves the scaffold transformation worked.

The eventual public install is `npm create scaffold-hbar@<verified-version> --`
with the official external repository option, frontend Next.js, Hardhat, npm,
**testnet**, and no automatic skills installation. The exact public command and
repository remain pending publication authorization and a real clean install;
there is intentionally no invented working repository URL here.
