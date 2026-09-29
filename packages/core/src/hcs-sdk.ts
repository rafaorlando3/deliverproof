import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';
import type { HcsKey } from './hcs.js';
import { validKey, validTopicId } from './hcs.js';
import { HcsPublishError, type TopicWriter } from './hcs-publish.js';

/**
 * Hedera testnet TopicWriter built on the Hiero JavaScript SDK.
 *
 * The operator account pays and its key is also the topic submit key, so one signature
 * covers both. The private key comes from the caller (read it from the process environment),
 * stays in this closure and never appears in a result, an error or a log line. Errors carry
 * only a code and, when the network returned one, the Hedera status name.
 */
export type SdkWriterConfig = {
  network: 'testnet';
  operatorId: string;
  operatorKeyType: HcsKey['type'];
  /** Raw hex private key (32 bytes, optional 0x). Never logged or returned. */
  operatorKey: string;
};

export type ReceiptData = { status: string; transactionId: string; topicId: string | null; sequence: number | null };
/** Runs a frozen transaction and returns its receipt fields. Replaced in tests. */
export type Executor = (
  tx: TopicCreateTransaction | TopicMessageSubmitTransaction,
  client: Client,
) => Promise<ReceiptData>;

const ACCOUNT_ID = /^0\.0\.[1-9][0-9]{0,15}$/;
const RAW_KEY = /^(0x)?[0-9a-f]{64}$/i;
const STATUS = /^[A-Z_]{1,64}$/;
const MAX_FEE = new Hbar(2);

function statusOf(e: unknown): string | undefined {
  const s = (e as { status?: { toString(): string } } | null)?.status?.toString?.();
  return typeof s === 'string' && STATUS.test(s) ? s : undefined;
}

export const sdkExecutor: Executor = async (tx, client) => {
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  const sequence = receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber.toString()) : null;
  return {
    status: receipt.status.toString(),
    transactionId: response.transactionId.toString(),
    topicId: receipt.topicId ? receipt.topicId.toString() : null,
    sequence,
  };
};

/** Builds the topic creation: submit key only, no admin key, so nobody can delete the
 * topic or swap its submit key later. */
export function buildCreateTopic(submitKey: PrivateKey, memo: string): TopicCreateTransaction {
  return new TopicCreateTransaction().setSubmitKey(submitKey.publicKey).setTopicMemo(memo);
}

/** Builds one single-chunk submission; a canonical message never needs more than one chunk. */
export function buildSubmit(topicId: string, message: Uint8Array): TopicMessageSubmitTransaction {
  return new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message)
    .setMaxChunks(1);
}

export function sdkTopicWriter(
  config: SdkWriterConfig,
  execute: Executor = sdkExecutor,
): TopicWriter & { close(): void } {
  if (!config || config.network !== 'testnet') throw new HcsPublishError('writer_unavailable');
  if (typeof config.operatorId !== 'string' || !ACCOUNT_ID.test(config.operatorId))
    throw new HcsPublishError('writer_unavailable');
  if (typeof config.operatorKey !== 'string' || !RAW_KEY.test(config.operatorKey))
    throw new HcsPublishError('writer_unavailable');
  let key: PrivateKey;
  try {
    const hex = config.operatorKey.replace(/^0x/i, '');
    if (config.operatorKeyType === 'ECDSA_SECP256K1') key = PrivateKey.fromStringECDSA(hex);
    else if (config.operatorKeyType === 'ED25519') key = PrivateKey.fromStringED25519(hex);
    else throw new Error();
  } catch {
    throw new HcsPublishError('writer_unavailable');
  }
  const publicKey: HcsKey = { type: config.operatorKeyType, key: key.publicKey.toStringRaw().toLowerCase() };
  if (!validKey(publicKey)) throw new HcsPublishError('writer_unavailable');

  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(config.operatorId), key);
  client.setDefaultMaxTransactionFee(MAX_FEE);
  client.setMaxAttempts(5);
  client.setRequestTimeout(30_000);

  async function run(
    tx: TopicCreateTransaction | TopicMessageSubmitTransaction,
    failure: 'create_failed' | 'submit_failed',
  ) {
    let r: ReceiptData;
    try {
      r = await execute(tx, client);
    } catch (e) {
      throw new HcsPublishError(failure, statusOf(e));
    }
    if (!r || r.status !== 'SUCCESS')
      throw new HcsPublishError(failure, typeof r?.status === 'string' && STATUS.test(r.status) ? r.status : undefined);
    return r;
  }

  return {
    submitKey: () => ({ ...publicKey }),
    async createTopic(memo) {
      if (typeof memo !== 'string' || new TextEncoder().encode(memo).length > 100)
        throw new HcsPublishError('create_failed');
      const r = await run(buildCreateTopic(key, memo), 'create_failed');
      if (!validTopicId(r.topicId)) throw new HcsPublishError('malformed_receipt');
      return { topicId: r.topicId as string };
    },
    async submit(topicId, message) {
      if (!validTopicId(topicId) || !(message instanceof Uint8Array) || message.length === 0 || message.length > 1024)
        throw new HcsPublishError('submit_failed');
      const r = await run(buildSubmit(topicId, message), 'submit_failed');
      if (!Number.isSafeInteger(r.sequence) || (r.sequence as number) < 1)
        throw new HcsPublishError('malformed_receipt');
      return { sequence: r.sequence as number, transactionId: r.transactionId };
    },
    close: () => client.close(),
  };
}
