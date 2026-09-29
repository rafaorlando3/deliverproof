// Solidity vs TypeScript cross-check. The commitment the contract stores (abi.encode in
// Solidity) is byte-for-byte equal to the one from src/delivery.ts, across several sizes, media types,
// codecs and agreements, and the Submitted event carries the same fields.
// This used to live in packages/hardhat/test/EscrowInvariants.js, importing the TS source via type stripping,
// which required Node >= 22.18 just for the contract suite. Here it runs under vitest on any supported Node.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { hardhat } from 'viem/chains';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { deliverProofAbi } from '../src/abi.js';
import { deliveryCommitment } from '../src/delivery.js';
import { artifact, startNode } from './hardhat-node.js';

const DP = artifact();
let stop: () => Promise<void>;
let pub: PublicClient, wallet: WalletClient;
let deployer: Address, buyer: Address, supplier: Address;

beforeAll(async () => {
  let url: string;
  ({ url, stop } = await startNode());
  pub = createPublicClient({ chain: hardhat, transport: http(url), pollingInterval: 20 }) as PublicClient;
  wallet = createWalletClient({ chain: hardhat, transport: http(url) });
  [deployer, buyer, supplier] = (await wallet.getAddresses()) as Address[];
}, 90_000);
afterAll(async () => {
  await stop?.();
});

async function mined(hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash });
  expect(r.status).toBe('success');
  return r;
}
function send(address: Address, from: Address, functionName: string, args: unknown[], value?: bigint) {
  return wallet
    .writeContract({
      account: from,
      chain: hardhat,
      address,
      abi: deliverProofAbi,
      functionName: functionName as never,
      args: args as never,
      value,
    } as never)
    .then(mined);
}
async function file(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await sha256.digest(bytes);
  return {
    size: BigInt(bytes.length),
    sha: ('0x' + Buffer.from(digest.digest).toString('hex')) as Hex,
    raw: CID.createV1(0x55, digest).toString(),
    pb: CID.createV1(0x70, digest).toString(),
  };
}

describe('Solidity vs TypeScript commitment', () => {
  it('same bytes on both sides across sizes, media types, codecs and agreements', async () => {
    const deployed = await mined(
      await wallet.deployContract({ account: deployer, chain: hardhat, abi: DP.abi, bytecode: DP.bytecode }),
    );
    const contract = deployed.contractAddress!;
    const cases: { text: string; media: 1 | 2 | 3 }[] = [
      { text: 'a', media: 1 },
      { text: 'Relatório sintético\n', media: 2 },
      { text: 'x'.repeat(5000), media: 3 },
    ];
    let checked = 0;
    for (const c of cases)
      for (const codec of ['raw', 'pb'] as const) {
        const f = await file(c.text);
        const cid = f[codec];
        const now = (await pub.getBlock()).timestamp;
        const terms = keccak256(stringToHex(`termos ${checked}`));
        const amount = 1_000n + BigInt(checked);
        await send(contract, buyer, 'createAgreement', [supplier, amount, now + 100n, now + 200n, terms]);
        const id =
          ((await pub.readContract({ address: contract, abi: DP.abi, functionName: 'nextId' })) as bigint) - 1n;
        await send(contract, buyer, 'fund', [id], amount);
        const r = await send(contract, supplier, 'submit', [id, cid, f.sha, f.size, c.media]);
        const onchain = (
          await pub.readContract({ address: contract, abi: deliverProofAbi, functionName: 'getAgreement', args: [id] })
        ).commitment;
        const ts = deliveryCommitment({
          chainId: 31337,
          contract,
          agreementId: id,
          termsHash: terms,
          cid,
          fileSha256: f.sha,
          fileSize: f.size,
          mediaType: c.media,
          version: 1,
        });
        expect(ts).toBe(onchain);
        const submitted = r.logs
          .filter(l => l.address.toLowerCase() === contract.toLowerCase())
          .map(l => decodeEventLog({ abi: deliverProofAbi, data: l.data, topics: l.topics }))
          .find(e => e.eventName === 'Submitted');
        expect(submitted?.args).toMatchObject({
          id,
          commitment: onchain,
          cid,
          fileSha256: f.sha,
          fileSize: f.size,
          mediaType: c.media,
          version: 1,
        });
        checked++;
      }
    expect(checked).toBe(6);
  });
});
