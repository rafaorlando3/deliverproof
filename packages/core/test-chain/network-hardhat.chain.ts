// Independent network tests:
// verifyAgreement against a real Hardhat node, read over JSON-RPC (viem), covering the
// full flows and a reader that lies, fails or returns partial history.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  encodeErrorResult,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { hardhat } from 'viem/chains';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { deliverProofAbi } from '../src/abi.js';
import { crossCheckHcs, hcsMessage, type TopicInfo, type TopicMessage } from '../src/hcs.js';
import { publishHcsTrail } from '../src/hcs-publish.js';
import { fakeHcs } from '../test/fake-hcs.js';
import {
  verifyAgreement,
  type ChainLog,
  type ChainReader,
  type NetworkResult,
  type TrustedDeployment,
} from '../src/network.js';
import { artifact, hardhatDir, startNode } from './hardhat-node.js';
import { viemReader } from './viem-reader.js';

const DP = artifact();
let stop: () => Promise<void>, url: string;
let pub: PublicClient, wallet: WalletClient;
let deployer: Address, buyer: Address, supplier: Address, stranger: Address;

beforeAll(async () => {
  ({ url, stop } = await startNode());
  pub = createPublicClient({ chain: hardhat, transport: http(url), pollingInterval: 20 }) as PublicClient;
  wallet = createWalletClient({ chain: hardhat, transport: http(url) });
  [deployer, buyer, supplier, stranger] = (await wallet.getAddresses()) as Address[];
}, 90_000);
afterAll(async () => {
  await stop?.();
});

async function mined(hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash });
  expect(r.status).toBe('success');
  return r;
}
async function deploy(): Promise<TrustedDeployment> {
  const hash = await wallet.deployContract({ account: deployer, chain: hardhat, abi: DP.abi, bytecode: DP.bytecode });
  const r = await mined(hash);
  return {
    chainId: 31337,
    address: r.contractAddress!,
    deployer,
    deploymentTx: hash,
    deploymentBlock: r.blockNumber,
    runtimeCodeHash: keccak256(DP.deployedBytecode),
  };
}
function call(t: TrustedDeployment, from: Address, functionName: string, args: unknown[], value?: bigint) {
  return wallet
    .writeContract({
      account: from,
      chain: hardhat,
      address: t.address,
      abi: deliverProofAbi,
      functionName: functionName as never,
      args: args as never,
      value,
    } as never)
    .then(mined);
}
async function now() {
  return (await pub.getBlock()).timestamp;
}
async function create(t: TrustedDeployment, amount = 5_000n, terms = keccak256('0x01')) {
  const ts = await now();
  const r = await call(t, buyer, 'createAgreement', [supplier, amount, ts + 3600n, ts + 7200n, terms]);
  const nextId = (await pub.readContract({ address: t.address, abi: DP.abi, functionName: 'nextId' })) as bigint;
  return { id: nextId - 1n, hash: r.transactionHash, amount };
}
async function file(text: string) {
  const bytes = new TextEncoder().encode(text);
  const d = await sha256.digest(bytes);
  return {
    cid: CID.createV1(0x55, d).toString(),
    sha: ('0x' + Buffer.from(d.digest).toString('hex')) as Hex,
    size: BigInt(bytes.length),
  };
}
async function submit(t: TrustedDeployment, id: bigint, text = 'entrega final') {
  const f = await file(text);
  return call(t, supplier, 'submit', [id, f.cid, f.sha, f.size, 1]);
}
async function commitmentOf(t: TrustedDeployment, id: bigint) {
  return (
    await pub.readContract({ address: t.address, abi: deliverProofAbi, functionName: 'getAgreement', args: [id] })
  ).commitment;
}
async function timeJump(seconds: number) {
  await pub.request({ method: 'evm_increaseTime', params: [seconds] } as never);
  await pub.request({ method: 'evm_mine', params: [] } as never);
}
const reader = () => viemReader(pub);
function events(r: NetworkResult) {
  expect(r).toMatchObject({ status: 'verified', code: 'chain_matches' });
  return r.status === 'verified' ? r.milestones.map(m => m.event) : [];
}
/** Reader that forwards everything to the real node, overriding only what the case needs. */
function lying(over: Partial<ChainReader>): ChainReader {
  return { ...reader(), ...over };
}

describe('anchor and deployed code', () => {
  it('the compiled artifact runtime hash equals the code hash on the node', async () => {
    const t = await deploy();
    expect(keccak256((await pub.getCode({ address: t.address }))!)).toBe(t.runtimeCodeHash);
  });
});

describe('full approval flow, verified at every step', () => {
  it('Created → Funded → Submitted → Approved → CreditAvailable → Withdrawn', async () => {
    const t = await deploy();
    const a = await create(t);
    const sent: Hex[] = [a.hash];
    expect(events(await verifyAgreement(t, a.id, reader()))).toEqual(['Created']);

    sent.push((await call(t, buyer, 'fund', [a.id], a.amount)).transactionHash);
    expect(events(await verifyAgreement(t, a.id, reader()))).toEqual(['Created', 'Funded']);

    sent.push((await submit(t, a.id)).transactionHash);
    const afterSubmit = await verifyAgreement(t, a.id, reader());
    expect(events(afterSubmit)).toEqual(['Created', 'Funded', 'Submitted']);
    const f = await file('entrega final');
    if (afterSubmit.status === 'verified')
      expect(afterSubmit.delivery).toMatchObject({ cid: f.cid, fileSha256: f.sha, fileSize: f.size, mediaType: 1 });

    const approve = await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    sent.push(approve.transactionHash, approve.transactionHash);
    expect(events(await verifyAgreement(t, a.id, reader()))).toEqual([
      'Created',
      'Funded',
      'Submitted',
      'Approved',
      'CreditAvailable',
    ]);

    sent.push((await call(t, supplier, 'withdraw', [a.id])).transactionHash);
    const end = await verifyAgreement(t, a.id, reader());
    expect(events(end)).toEqual(['Created', 'Funded', 'Submitted', 'Approved', 'CreditAvailable', 'Withdrawn']);
    if (end.status === 'verified') {
      expect(end.agreement).toMatchObject({ state: 4, withdrawn: true });
      expect(end.milestones.map(m => m.hash)).toEqual(sent);
    }
  });
});

describe('refund flows', () => {
  it('supplier refunds before delivering; buyer withdraws', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await call(t, supplier, 'refund', [a.id]);
    expect(events(await verifyAgreement(t, a.id, reader()))).toEqual([
      'Created',
      'Funded',
      'Refunded',
      'CreditAvailable',
    ]);
    await call(t, buyer, 'withdraw', [a.id]);
    const r = await verifyAgreement(t, a.id, reader());
    expect(events(r)).toEqual(['Created', 'Funded', 'Refunded', 'CreditAvailable', 'Withdrawn']);
    if (r.status === 'verified') expect(r.delivery).toBeNull();
  });
  it('buyer refunds after reviewDeadline with a delivery submitted; buyer withdraws', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    await timeJump(7201);
    await call(t, buyer, 'refund', [a.id]);
    expect(events(await verifyAgreement(t, a.id, reader()))).toEqual([
      'Created',
      'Funded',
      'Submitted',
      'Refunded',
      'CreditAvailable',
    ]);
    await call(t, buyer, 'withdraw', [a.id]);
    const r = await verifyAgreement(t, a.id, reader());
    expect(events(r)).toEqual(['Created', 'Funded', 'Submitted', 'Refunded', 'CreditAvailable', 'Withdrawn']);
    if (r.status === 'verified') expect(r.agreement).toMatchObject({ state: 5, withdrawn: true });
  });
});

describe('another contract and another agreement', () => {
  it('second deployment with the same bytecode: each anchor accepts only its own contract', async () => {
    const A = await deploy(),
      B = await deploy();
    expect(B.runtimeCodeHash).toBe(A.runtimeCodeHash); // same code: only address + deploy tx tell them apart
    const a = await create(A, 5_000n, keccak256('0xaa'));
    const b = await create(B, 7_000n, keccak256('0xbb'));
    expect(b.id).toBe(a.id);
    expect(events(await verifyAgreement(A, a.id, reader()))).toEqual(['Created']);
    expect(events(await verifyAgreement(B, b.id, reader()))).toEqual(['Created']);
    expect(
      await verifyAgreement({ ...B, deploymentTx: A.deploymentTx, deploymentBlock: A.deploymentBlock }, a.id, reader()),
    ).toEqual({ status: 'mismatch', code: 'deployment_mismatch' });
    // RPC that ignores the address filter and mixes in the real event from contract B
    const bLogs = await reader().logs(B.address, b.id, B.deploymentBlock, await pub.getBlockNumber());
    const mixed = lying({ logs: async (...p) => [...(await reader().logs(...p)), ...bLogs] });
    expect(await verifyAgreement(A, a.id, mixed)).toEqual({ status: 'mismatch', code: 'wrong_event_contract' });
  });
  it('events from another agreement on the same contract are excluded', async () => {
    const t = await deploy();
    const a1 = await create(t);
    const a2 = await create(t);
    await call(t, buyer, 'fund', [a2.id], a2.amount);
    const other = await reader().logs(t.address, a2.id, t.deploymentBlock, await pub.getBlockNumber());
    expect(events(await verifyAgreement(t, a1.id, reader()))).toEqual(['Created']);
    const mixed = lying({ logs: async (...p) => [...(await reader().logs(...p)), ...other] });
    expect(await verifyAgreement(t, a1.id, mixed)).toEqual({ status: 'mismatch', code: 'wrong_event_agreement' });
  });
  it('funding forged by a contract that mimics the events never becomes verified', async () => {
    const t = await deploy();
    const a = await create(t);
    const { mimic } = await helpers();
    const ag = await pub.readContract({
      address: t.address,
      abi: deliverProofAbi,
      functionName: 'getAgreement',
      args: [a.id],
    });
    const fakeTx = await wallet.writeContract({
      account: stranger,
      chain: hardhat,
      address: mimic,
      abi: MIMIC_ABI,
      functionName: 'fake',
      args: [a.id, buyer, supplier, ag.amountTinybar, ag.deliveryDeadline, ag.reviewDeadline, ag.termsHash],
    });
    const fr = await mined(fakeTx);
    const fakeFunded = fr.logs[1]!;
    const asLog = (addr: Address): ChainLog => ({
      address: addr,
      topics: fakeFunded.topics as Hex[],
      data: fakeFunded.data,
      transactionHash: fakeTx,
      blockNumber: fr.blockNumber,
      blockHash: fr.blockHash,
      logIndex: fakeFunded.logIndex,
      removed: false,
    });
    const claimsFunded = {
      agreement: async (...p: Parameters<ChainReader['agreement']>) => ({
        ...(await reader().agreement(...p)),
        state: 2,
      }),
    };
    // 1) RPC returns the mimic's log as is
    expect(
      await verifyAgreement(
        t,
        a.id,
        lying({ ...claimsFunded, logs: async (...p) => [...(await reader().logs(...p)), asLog(mimic)] }),
      ),
    ).toEqual({ status: 'mismatch', code: 'wrong_event_contract' });
    // 2) RPC rewrites the log address to the real contract
    expect(
      await verifyAgreement(
        t,
        a.id,
        lying({ ...claimsFunded, logs: async (...p) => [...(await reader().logs(...p)), asLog(t.address)] }),
      ),
    ).toEqual({ status: 'inconclusive', code: 'receipt_log_missing' });
  });
});

describe('missing, duplicated or out-of-order history', () => {
  async function approvedAndWithdrawn() {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    await call(t, supplier, 'withdraw', [a.id]);
    const all = await reader().logs(t.address, a.id, t.deploymentBlock, await pub.getBlockNumber());
    return { t, a, all };
  }
  const nameOf = (l: ChainLog) =>
    (
      deliverProofAbi.find(
        x =>
          x.type === 'event' &&
          l.topics[0] === keccak256(new TextEncoder().encode(`${x.name}(${x.inputs.map(i => i.type).join(',')})`)),
      ) as { name: string }
    ).name;

  it('order shuffled by the RPC still verifies (order comes from block and logIndex)', async () => {
    const { t, a, all } = await approvedAndWithdrawn();
    expect(events(await verifyAgreement(t, a.id, lying({ logs: async () => [...all].reverse() })))).toHaveLength(6);
  });
  it.each(['Created', 'Funded', 'Submitted', 'Approved', 'CreditAvailable', 'Withdrawn'])(
    'missing %s: inconclusive, never verified',
    async ev => {
      const { t, a, all } = await approvedAndWithdrawn();
      const r = await verifyAgreement(t, a.id, lying({ logs: async () => all.filter(l => nameOf(l) !== ev) }));
      expect(r.status).toBe('inconclusive');
      expect(r.code).toBe('incomplete_event_history');
    },
  );
  it.each(['Created', 'Approved', 'Withdrawn'])('duplicated %s: inconclusive', async ev => {
    const { t, a, all } = await approvedAndWithdrawn();
    const dup = all.find(l => nameOf(l) === ev)!;
    expect(await verifyAgreement(t, a.id, lying({ logs: async () => [...all, { ...dup }] }))).toEqual({
      status: 'inconclusive',
      code: 'duplicate_rpc_log',
    });
  });
  it('log with the transactionHash of another real transaction of the agreement: does not verify', async () => {
    const { t, a, all } = await approvedAndWithdrawn();
    const swapped = all.map(l => (nameOf(l) === 'Approved' ? { ...l, transactionHash: all[0]!.transactionHash } : l));
    const r = await verifyAgreement(t, a.id, lying({ logs: async () => swapped }));
    expect(r.status).not.toBe('verified');
  });
});

describe('agreement state and history from different nodes', () => {
  it('getAgreement from a lagging node (real state from an earlier block) with newer logs: inconclusive', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    const s = await submit(t, a.id);
    await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    await call(t, supplier, 'withdraw', [a.id]);
    const stale = lying({ agreement: async (addr, id) => reader().agreement(addr, id, s.blockNumber) });
    expect((await reader().agreement(t.address, a.id, s.blockNumber)).state).toBe(3);
    expect(await verifyAgreement(t, a.id, stale)).toEqual({ status: 'inconclusive', code: 'incomplete_event_history' });
  });
  it('deposit value in Hedera scale (x10^10) on a 31337 network: mismatch', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    const scaled = lying({
      transaction: async h => {
        const x = await reader().transaction(h);
        return { ...x, value: x.value * 10_000_000_000n };
      },
    });
    expect(await verifyAgreement(t, a.id, scaled)).toEqual({ status: 'mismatch', code: 'deposit_value_mismatch' });
  });
});

describe('partial or unstable RPC', () => {
  async function funded() {
    const t = await deploy();
    const a = await create(t);
    const f = await call(t, buyer, 'fund', [a.id], a.amount);
    return { t, a, fundTx: f.transactionHash, fundBlock: f.blockNumber };
  }
  it('deposit receipt disappears: inconclusive/not_found', async () => {
    const { t, a, fundTx } = await funded();
    const r = await verifyAgreement(
      t,
      a.id,
      lying({ receipt: async h => (h === fundTx ? null : reader().receipt(h)) }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'not_found' });
  });
  it('getLogs, transaction, code or getAgreement fail: inconclusive/rpc_unavailable', async () => {
    const { t, a } = await funded();
    const boom = async () => {
      throw new Error('ECONNRESET');
    };
    for (const over of [{ logs: boom }, { transaction: boom }, { code: boom }, { agreement: boom }]) {
      expect(await verifyAgreement(t, a.id, lying(over))).toEqual({ status: 'inconclusive', code: 'rpc_unavailable' });
    }
  });
  it('block of an older event with a different hash (reorg): inconclusive/history_changed', async () => {
    const { t, a, fundBlock } = await funded();
    const createdBlock = (await pub.getTransactionReceipt({ hash: a.hash })).blockNumber;
    expect(createdBlock).toBeLessThan(fundBlock); // not the snapshot block, which has its own check at the end
    const r = await verifyAgreement(
      t,
      a.id,
      lying({
        block: async n => {
          const b = await reader().block(n);
          return n === createdBlock ? { ...b, hash: keccak256(b.hash) } : b;
        },
      }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'history_changed' });
  });
  it('snapshot block changes during the read: inconclusive/history_changed', async () => {
    const { t, a } = await funded();
    await create(t); // snapshot block without an event of this agreement: only the final re-read checks it
    let latestSeen: bigint | undefined;
    const r = await verifyAgreement(
      t,
      a.id,
      lying({
        block: async n => {
          const b = await reader().block(n);
          if (n === 'latest') {
            latestSeen = b.number;
            return b;
          }
          return n === latestSeen ? { ...b, hash: keccak256(b.hash) } : b;
        },
      }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'history_changed' });
  });
  it('getLogs returns the deposit but the transaction receipt lacks that log: inconclusive/receipt_log_missing', async () => {
    const { t, a, fundTx } = await funded();
    const r = await verifyAgreement(
      t,
      a.id,
      lying({
        receipt: async h => {
          const x = await reader().receipt(h);
          return x && h === fundTx ? { ...x, logs: [] } : x;
        },
      }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'receipt_log_missing' });
  });
  it('node behind the deployment: inconclusive/node_behind', async () => {
    const { t, a } = await funded();
    const r = await verifyAgreement(
      t,
      a.id,
      lying({
        block: async n => {
          const b = await reader().block(n);
          return n === 'latest' ? { ...b, number: t.deploymentBlock - 1n } : b;
        },
      }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'node_behind' });
  });
  it('no code at the address: inconclusive/code_unavailable', async () => {
    const { t, a } = await funded();
    expect(await verifyAgreement(t, a.id, lying({ code: async () => undefined }))).toEqual({
      status: 'inconclusive',
      code: 'code_unavailable',
    });
  });
  it('agreement with a missing field: inconclusive/malformed_response', async () => {
    const { t, a } = await funded();
    const r = await verifyAgreement(
      t,
      a.id,
      lying({
        agreement: async (...p) => {
          const x = { ...(await reader().agreement(...p)) } as Record<string, unknown>;
          delete x.termsHash;
          return x as never;
        },
      }),
    );
    expect(r).toEqual({ status: 'inconclusive', code: 'malformed_response' });
  });
});

describe('Hedera relay eth_getLogs limit (7 days per query)', () => {
  // Simulates the relay rejecting a range by width. Here the limit is in blocks (5) to fit the test;
  // on the relay the limit is time: TIMESTAMP_RANGE_TOO_LARGE above 604800 s, even with a single address.
  function limited(maxSpan: bigint): PublicClient {
    const base = createPublicClient({ chain: hardhat, transport: http(url) });
    return createPublicClient({
      chain: hardhat,
      transport: custom({
        async request({ method, params }: { method: string; params?: unknown }) {
          if (method === 'eth_getLogs') {
            const [{ fromBlock, toBlock }] = params as [{ fromBlock: Hex; toBlock: Hex }];
            if (BigInt(toBlock) - BigInt(fromBlock) > maxSpan)
              throw Object.assign(new Error('TIMESTAMP_RANGE_TOO_LARGE'), { code: -32004 });
          }
          return base.request({ method, params } as never);
        },
      }),
    }) as PublicClient;
  }
  it('a single query from deployment to the latest block fails past the limit; with windows, it verifies', async () => {
    const t = await deploy();
    const a = await create(t);
    for (let i = 0; i < 8; i++) await create(t); // extra blocks between deployment and deposit
    await call(t, buyer, 'fund', [a.id], a.amount);
    expect(await verifyAgreement(t, a.id, viemReader(limited(5n)))).toEqual({
      status: 'inconclusive',
      code: 'rpc_unavailable',
    });
    expect(events(await verifyAgreement(t, a.id, viemReader(limited(5n), { maxBlocksPerLogQuery: 5n })))).toEqual([
      'Created',
      'Funded',
    ]);
    expect(events(await verifyAgreement(t, a.id, viemReader(pub, { maxBlocksPerLogQuery: 1n })))).toEqual([
      'Created',
      'Funded',
    ]);
  });
});

describe('log windows with real EVM timestamps', () => {
  it('the same proof with an eight-day jump fails without windows and passes with the production pager', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await pub.request({ method: 'evm_increaseTime', params: [8 * 86_400] } as never);
    await pub.request({ method: 'evm_mine', params: [] } as never);
    const spans: bigint[] = [];
    const limited = createPublicClient({
      chain: hardhat,
      transport: custom({
        async request({ method, params }: { method: string; params?: unknown }) {
          if (method === 'eth_getLogs') {
            const [filter] = params as [{ fromBlock: Hex; toBlock: Hex }];
            const first = await pub.getBlock({ blockNumber: BigInt(filter.fromBlock) });
            const last = await pub.getBlock({ blockNumber: BigInt(filter.toBlock) });
            const span = last.timestamp - first.timestamp;
            spans.push(span);
            if (span > 7n * 86_400n) throw Object.assign(new Error('TIMESTAMP_RANGE_TOO_LARGE'), { code: -32004 });
          }
          return pub.request({ method, params } as never);
        },
      }),
    }) as PublicClient;
    expect(await verifyAgreement(t, a.id, viemReader(limited))).toEqual({
      status: 'inconclusive',
      code: 'rpc_unavailable',
    });
    spans.length = 0;
    expect(events(await verifyAgreement(t, a.id, viemReader(limited, { timeWindows: true })))).toEqual([
      'Created',
      'Funded',
    ]);
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.every(s => s <= 6n * 86_400n)).toBe(true);
  });
});

describe('VALIDATION.md list: RPC that lies consistently (matching logs and receipts)', () => {
  async function done() {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    await call(t, supplier, 'withdraw', [a.id]);
    return { t, a };
  }
  const topicOf = (name: string) => {
    const e = deliverProofAbi.find(x => x.type === 'event' && x.name === name) as unknown as {
      inputs: readonly { type: string }[];
    };
    return keccak256(new TextEncoder().encode(`${name}(${e.inputs.map(i => i.type).join(',')})`));
  };
  /** Swaps the same log in getLogs and in the receipt so the lie passes the consistency checks. */
  function rewrite(name: string, fn: (l: ChainLog) => ChainLog): ChainReader {
    const fix = (l: ChainLog) => (l.topics[0] === topicOf(name) ? fn({ ...l }) : l);
    return lying({
      logs: async (...p) => (await reader().logs(...p)).map(fix),
      receipt: async h => {
        const r = await reader().receipt(h);
        return r && { ...r, logs: r.logs.map(fix) };
      },
    });
  }
  const addrTopic = (a: Address) => ('0x' + a.slice(2).toLowerCase().padStart(64, '0')) as Hex;
  const amountData = (n: bigint) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
  it('credit to the wrong beneficiary: mismatch/credit_mismatch', async () => {
    const { t, a } = await done();
    expect(
      await verifyAgreement(
        t,
        a.id,
        rewrite('CreditAvailable', l => ({ ...l, topics: [l.topics[0]!, l.topics[1]!, addrTopic(buyer)] })),
      ),
    ).toEqual({ status: 'mismatch', code: 'credit_mismatch' });
  });
  it('credit with a different amount: mismatch/credit_mismatch', async () => {
    const { t, a } = await done();
    expect(
      await verifyAgreement(
        t,
        a.id,
        rewrite('CreditAvailable', l => ({ ...l, data: amountData(a.amount + 1n) })),
      ),
    ).toEqual({ status: 'mismatch', code: 'credit_mismatch' });
  });
  it('withdrawal to another account or with another amount: mismatch/withdrawal_mismatch', async () => {
    const { t, a } = await done();
    expect(
      await verifyAgreement(
        t,
        a.id,
        rewrite('Withdrawn', l => ({ ...l, topics: [l.topics[0]!, l.topics[1]!, addrTopic(stranger)] })),
      ),
    ).toEqual({ status: 'mismatch', code: 'withdrawal_mismatch' });
    expect(
      await verifyAgreement(
        t,
        a.id,
        rewrite('Withdrawn', l => ({ ...l, data: amountData(a.amount - 1n) })),
      ),
    ).toEqual({ status: 'mismatch', code: 'withdrawal_mismatch' });
  });
  it('approval with another commitment: mismatch/approval_mismatch', async () => {
    const { t, a } = await done();
    expect(
      await verifyAgreement(
        t,
        a.id,
        rewrite('Approved', l => ({ ...l, topics: [l.topics[0]!, l.topics[1]!, keccak256('0x09')] })),
      ),
    ).toEqual({ status: 'mismatch', code: 'approval_mismatch' });
  });
  it('anchor with another deployer: mismatch/deployment_mismatch', async () => {
    const { t, a } = await done();
    expect(await verifyAgreement({ ...t, deployer: stranger }, a.id, reader())).toEqual({
      status: 'mismatch',
      code: 'deployment_mismatch',
    });
  });
  it('history above 256 events: inconclusive/event_limit', async () => {
    const { t, a } = await done();
    const all = await reader().logs(t.address, a.id, t.deploymentBlock, await pub.getBlockNumber());
    const big = Array.from({ length: 257 }, (_, i) => ({ ...all[i % all.length]!, logIndex: 1000 + i }));
    expect(await verifyAgreement(t, a.id, lying({ logs: async () => big }))).toEqual({
      status: 'inconclusive',
      code: 'event_limit',
    });
  });
  it('the same file in two agreements: different commitments, each verifies only its own; the other one does not approve', async () => {
    const t = await deploy();
    const a1 = await create(t);
    const a2 = await create(t);
    for (const a of [a1, a2]) {
      await call(t, buyer, 'fund', [a.id], a.amount);
      await submit(t, a.id, 'mesmo arquivo');
    }
    const c1 = await commitmentOf(t, a1.id),
      c2 = await commitmentOf(t, a2.id);
    expect(c1).not.toBe(c2);
    const r1 = await verifyAgreement(t, a1.id, reader()),
      r2 = await verifyAgreement(t, a2.id, reader());
    if (r1.status !== 'verified' || r2.status !== 'verified') throw new Error('expected verified for both');
    expect(r1.delivery?.cid).toBe(r2.delivery?.cid);
    await expect(
      pub.simulateContract({
        account: buyer,
        address: t.address,
        abi: DP.abi,
        functionName: 'approve',
        args: [a1.id, c2],
      }),
    ).rejects.toThrow(/WrongCommitment/);
  });
});

describe('classification decisions', () => {
  it('contract wallet with a real event is inconclusive/unsupported_caller', async () => {
    const t = await deploy();
    const { wallet: w } = await helpers();
    const ts = await now();
    await mined(
      await wallet.writeContract({
        account: buyer,
        chain: hardhat,
        address: w,
        abi: WALLET_ABI,
        functionName: 'create',
        args: [t.address, supplier, 5_000n, ts + 3600n, ts + 7200n, keccak256('0x02')],
      }),
    );
    const id = ((await pub.readContract({ address: t.address, abi: DP.abi, functionName: 'nextId' })) as bigint) - 1n;
    const ag = await pub.readContract({
      address: t.address,
      abi: deliverProofAbi,
      functionName: 'getAgreement',
      args: [id],
    });
    expect(ag.buyer.toLowerCase()).toBe(w.toLowerCase()); // the on-chain buyer is the contract wallet
    expect(await verifyAgreement(t, id, reader())).toEqual({ status: 'inconclusive', code: 'unsupported_caller' });
  });
  it('a nonexistent id is told apart from an RPC failure by the decoded revert', async () => {
    const t = await deploy();
    expect(await verifyAgreement(t, 999n, reader())).toEqual({ status: 'inconclusive', code: 'unknown_agreement' });
  });
  it('the ABI declares the errors and viem names WrongCommitment', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    let data: Hex | undefined;
    try {
      await pub.simulateContract({
        account: buyer,
        address: t.address,
        abi: deliverProofAbi,
        functionName: 'approve',
        args: [a.id, keccak256('0x03')],
      });
    } catch (e) {
      const rev = (e as BaseError).walk(
        x => x instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | null;
      expect(rev?.data?.errorName).toBe('WrongCommitment');
      data = rev?.raw;
    }
    expect(data).toMatch(/^0x[0-9a-f]{8}$/);
    expect(data).toBe(encodeErrorResult({ abi: deliverProofAbi, errorName: 'WrongCommitment' }));
  });
});

// ---------- helper contracts, compiled in memory with the same pinned solc 0.8.28 ----------
const HELPERS_SOL = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
interface IDP { function createAgreement(address,uint64,uint64,uint64,bytes32) external returns (uint256); }
contract ForwardingWallet {
  address private immutable owner;
  constructor() { owner = msg.sender; }
  function create(IDP dp, address s, uint64 a, uint64 d, uint64 r, bytes32 t) external { require(msg.sender == owner); dp.createAgreement(s, a, d, r, t); }
}
contract EventMimic {
  event Created(uint256 indexed id, address indexed buyer, address indexed supplier, uint64 amountTinybar, uint64 deliveryDeadline, uint64 reviewDeadline, bytes32 termsHash);
  event Funded(uint256 indexed id, uint64 amountTinybar);
  function fake(uint256 id, address b, address s, uint64 a, uint64 d, uint64 r, bytes32 t) external { emit Created(id, b, s, a, d, r, t); emit Funded(id, a); }
}`;
const WALLET_ABI = [
  {
    type: 'function',
    name: 'create',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      { name: 'dp', type: 'address' },
      { name: 's', type: 'address' },
      { name: 'a', type: 'uint64' },
      { name: 'd', type: 'uint64' },
      { name: 'r', type: 'uint64' },
      { name: 't', type: 'bytes32' },
    ],
  },
] as const;
const MIMIC_ABI = [
  {
    type: 'function',
    name: 'fake',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'b', type: 'address' },
      { name: 's', type: 'address' },
      { name: 'a', type: 'uint64' },
      { name: 'd', type: 'uint64' },
      { name: 'r', type: 'uint64' },
      { name: 't', type: 'bytes32' },
    ],
  },
] as const;
let helperCache: Promise<{ wallet: Address; mimic: Address }> | undefined;
function helpers() {
  return (helperCache ??= (async () => {
    const solc = createRequire(path.join(hardhatDir, 'package.json'))('solc');
    const out = JSON.parse(
      solc.compile(
        JSON.stringify({
          language: 'Solidity',
          sources: { 'H.sol': { content: HELPERS_SOL } },
          settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: 'paris',
            outputSelection: { '*': { '*': ['evm.bytecode.object'] } },
          },
        }),
      ),
    );
    const errs = (out.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
    if (errs.length) throw new Error(JSON.stringify(errs));
    const dep = async (name: string, from: Address) =>
      (
        await mined(
          await wallet.deployContract({
            account: from,
            chain: hardhat,
            abi: [],
            bytecode: ('0x' + out.contracts['H.sol'][name].evm.bytecode.object) as Hex,
          }),
        )
      ).contractAddress!;
    return { wallet: await dep('ForwardingWallet', buyer), mimic: await dep('EventMimic', stranger) };
  })());
}

describe('supplementary HCS trail over real node events', () => {
  it('one message per verified event; Approved and CreditAvailable share a transaction with different logIndex', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    const r = await verifyAgreement(t, a.id, reader());
    expect(r.status).toBe('verified');
    if (r.status !== 'verified') return;
    const approved = r.milestones.find(m => m.event === 'Approved')!;
    const credit = r.milestones.find(m => m.event === 'CreditAvailable')!;
    expect(approved.hash).toBe(credit.hash);
    expect(approved.logIndex).not.toBe(credit.logIndex);

    const key = { type: 'ED25519' as const, key: '11'.repeat(32) };
    const topic: TopicInfo = { topicId: '0.0.9001', deleted: false, submitKey: key };
    const posted: TopicMessage[] = r.milestones.map((m, i) => ({
      topicId: '0.0.9001',
      sequence: i + 1,
      consensusTimestamp: `17906650${i}0.000000001`,
      bytes: new TextEncoder().encode(hcsMessage(t, a.id, m)),
      chunkTotal: 1,
    }));
    const trusted = { topicId: '0.0.9001', submitKey: key };
    expect(crossCheckHcs(t, a.id, r, trusted, topic, posted)).toMatchObject({ status: 'consistent', duplicates: 0 });
    expect(crossCheckHcs(t, a.id, r, trusted, topic, posted.slice(0, 3))).toMatchObject({ status: 'incomplete' });

    // An event from the same contract but another agreement is ignored, not confused.
    const b = await create(t);
    const other = await verifyAgreement(t, b.id, reader());
    expect(other.status).toBe('verified');
    if (other.status !== 'verified') return;
    const foreign: TopicMessage = {
      ...posted[0]!,
      sequence: 99,
      bytes: new TextEncoder().encode(hcsMessage(t, b.id, other.milestones[0]!)),
    };
    expect(crossCheckHcs(t, a.id, r, trusted, topic, [...posted, foreign])).toMatchObject({
      status: 'consistent',
      ignored: 1,
    });
    // The same real transaction attributed to the wrong agreement. It was mined after the `r` snapshot:
    // the old read cannot judge it (inconclusive); after re-reading history, it is a mismatch.
    const wrong: TopicMessage = {
      ...foreign,
      sequence: 100,
      bytes: new TextEncoder().encode(hcsMessage(t, a.id, other.milestones[0]!)),
    };
    expect(other.milestones[0]!.block).toBeGreaterThan(r.snapshot.number);
    expect(crossCheckHcs(t, a.id, r, trusted, topic, [...posted, wrong])).toEqual({
      status: 'inconclusive',
      code: 'hcs_after_snapshot',
    });
    const again = await verifyAgreement(t, a.id, reader());
    expect(again.status).toBe('verified');
    if (again.status !== 'verified') return;
    expect(crossCheckHcs(t, a.id, again, trusted, topic, [...posted, wrong])).toEqual({
      status: 'mismatch',
      code: 'hcs_unknown_event',
    });
  });

  it('legitimate event mined after the snapshot, with its message already on the topic: inconclusive, and consistent on re-read', async () => {
    const t = await deploy();
    const a = await create(t);
    // Canonical read at block N: only Created.
    const atN = await verifyAgreement(t, a.id, reader());
    expect(atN.status).toBe('verified');
    if (atN.status !== 'verified') return;
    expect(atN.milestones.map(m => m.event)).toEqual(['Created']);

    // Before the HCS read, the buyer deposits (N+1) and the publisher posts both messages.
    await call(t, buyer, 'fund', [a.id], a.amount);
    const atN1 = await verifyAgreement(t, a.id, reader());
    expect(atN1.status).toBe('verified');
    if (atN1.status !== 'verified') return;
    const funded = atN1.milestones.find(m => m.event === 'Funded')!;
    expect(funded.block).toBeGreaterThan(atN.snapshot.number);

    const key = { type: 'ECDSA_SECP256K1' as const, key: '02' + '22'.repeat(32) };
    const topic: TopicInfo = { topicId: '0.0.9002', deleted: false, submitKey: key };
    const trusted = { topicId: '0.0.9002', submitKey: key };
    const posted: TopicMessage[] = atN1.milestones.map((m, i) => ({
      topicId: '0.0.9002',
      sequence: i + 1,
      consensusTimestamp: `17906651${i}0.000000001`,
      bytes: new TextEncoder().encode(hcsMessage(t, a.id, m)),
      chunkTotal: 1,
    }));

    // Before the fix this gave mismatch/hcs_unknown_event: a false mismatch.
    expect(crossCheckHcs(t, a.id, atN, trusted, topic, posted)).toEqual({
      status: 'inconclusive',
      code: 'hcs_after_snapshot',
    });
    expect(crossCheckHcs(t, a.id, atN1, trusted, topic, posted)).toMatchObject({ status: 'consistent', duplicates: 0 });

    // A fabricated event inside the read range is still a mismatch, even with the later message.
    const invented: TopicMessage = {
      ...posted[0]!,
      sequence: 50,
      bytes: new TextEncoder().encode(
        hcsMessage(t, a.id, { event: 'Refunded', hash: keccak256('0x99'), block: atN.snapshot.number, logIndex: 0 }),
      ),
    };
    for (const history of [atN, atN1])
      expect(crossCheckHcs(t, a.id, history, trusted, topic, [...posted, invented])).toEqual({
        status: 'mismatch',
        code: 'hcs_unknown_event',
      });
  });
});

describe('HCS publisher over real node events (in-memory topic, no Hedera network)', () => {
  it('publishes what is missing and checks it; after withdrawal publishes only the new event; a stale read is rejected', async () => {
    const t = await deploy();
    const a = await create(t);
    await call(t, buyer, 'fund', [a.id], a.amount);
    await submit(t, a.id);
    await call(t, buyer, 'approve', [a.id, await commitmentOf(t, a.id)]);
    const before = await verifyAgreement(t, a.id, reader());
    expect(before.status).toBe('verified');
    const key = { type: 'ED25519' as const, key: '11'.repeat(32) };
    const trusted = { topicId: '0.0.9002', submitKey: key };
    const f = fakeHcs(trusted.topicId, key, 1); // the mirror shows each message one read later
    const fast = { confirmDelayMs: 0 };

    const first = await publishHcsTrail(t, a.id, before, trusted, f.reader, f.writer, fast);
    expect(first).toMatchObject({ status: 'published', confirmed: true, check: { status: 'consistent' } });
    expect(f.submits).toBe(5);
    if (before.status === 'verified')
      expect(f.consensus().map(m => new TextDecoder().decode(m.bytes))).toEqual(
        before.milestones.map(m => hcsMessage(t, a.id, m)),
      );

    await call(t, supplier, 'withdraw', [a.id]);
    const after = await verifyAgreement(t, a.id, reader());
    const second = await publishHcsTrail(t, a.id, after, trusted, f.reader, f.writer, fast);
    expect(second).toMatchObject({ status: 'published', confirmed: true });
    if (second.status === 'published') {
      expect(second.submitted).toHaveLength(1);
      expect(JSON.parse(second.submitted[0]!.message)).toMatchObject({
        event: 'Withdrawn',
        agreementId: a.id.toString(),
      });
    }
    expect(f.submits).toBe(6);

    // The contract read from before the withdrawal does not see the Withdrawn already on the topic.
    expect(await publishHcsTrail(t, a.id, before, trusted, f.reader, f.writer, fast)).toEqual({
      status: 'refused',
      code: 'hcs_after_snapshot',
    });
    expect(await publishHcsTrail(t, a.id, after, trusted, f.reader, f.writer, fast)).toMatchObject({
      status: 'up_to_date',
    });
    expect(f.submits).toBe(6);
  });
});
