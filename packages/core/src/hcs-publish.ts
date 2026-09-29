import type { NetworkResult, TrustedDeployment } from './network.js';
import {
  HCS_DOMAIN,
  hcsPending,
  parseHcsMessage,
  validKey,
  validTopicId,
  verifyHcsTrail,
  type HcsKey,
  type HcsResult,
  type TopicReader,
  type TrustedTopic,
} from './hcs.js';

/**
 * Publisher for the supplemental HCS evidence trail.
 *
 * It only writes the canonical messages that verifyHcsTrail reports as missing for a
 * contract history that verifyAgreement already verified. It never writes when the topic
 * is in doubt (mismatch or inconclusive), never writes anything that is not the exact
 * canonical encoding, and never changes the contract verdict. The key that signs stays
 * inside the TopicWriter; this module only sees the public submit key.
 * Run one publisher per topic. A retry after an interruption may leave a duplicate message;
 * the verifier counts duplicates and keeps the earliest sequence as the reference.
 */
export const MAX_PUBLISH_PER_RUN = 16;
export const TOPIC_MEMO = HCS_DOMAIN;

export type Submitted = { sequence: number; transactionId: string; message: string };

/** Signs and sends. Implemented by hcs-sdk.ts for Hedera testnet, or by a fake in tests. */
export interface TopicWriter {
  /** The public key that signs submissions. Never the private key. */
  submitKey(): HcsKey;
  /** Creates a topic whose submit key is submitKey() and which has no admin key. */
  createTopic(memo: string): Promise<{ topicId: string }>;
  /** Sends one single-chunk message and returns the consensus receipt data. */
  submit(topicId: string, message: Uint8Array): Promise<{ sequence: number; transactionId: string }>;
}

export class HcsPublishError extends Error {
  constructor(
    readonly code: 'writer_unavailable' | 'submit_failed' | 'malformed_receipt' | 'create_failed',
    readonly status?: string,
  ) {
    super(code);
    this.name = 'HcsPublishError';
  }
}

export type PublishOptions = {
  /** Mirror rereads after publishing, to see the new messages. Default 6. */
  confirmAttempts?: number;
  /** Delay between rereads in milliseconds. Default 3000. */
  confirmDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type PublishResult =
  /** The topic already had one message per verified event. Nothing was written. */
  | { status: 'up_to_date'; check: HcsResult }
  /** Missing messages were written. `confirmed` is true only when a reread saw them all. */
  | { status: 'published'; submitted: Submitted[]; confirmed: boolean; check: HcsResult }
  /** A submission failed after `submitted` succeeded. Rerun after checking the topic. */
  | { status: 'interrupted'; submitted: Submitted[]; code: string; txStatus?: string }
  /** Nothing was written: the topic or the input is in doubt. */
  | { status: 'refused'; code: string };

const TX_ID = /^0\.0\.[1-9][0-9]{0,15}@[0-9]{1,12}\.[0-9]{1,9}$/;
const STATUS = /^[A-Z_]{1,64}$/;

const sameKey = (a: HcsKey, b: HcsKey) => a.type === b.type && a.key.toLowerCase() === b.key.toLowerCase();
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function writerKey(writer: TopicWriter): HcsKey | null {
  try {
    const k = writer.submitKey();
    return validKey(k) ? k : null;
  } catch {
    return null;
  }
}

/** Creates the protected topic. The caller records the result as the TrustedTopic. */
export async function createHcsTopic(writer: TopicWriter): Promise<TrustedTopic> {
  const submitKey = writerKey(writer);
  if (!submitKey) throw new HcsPublishError('writer_unavailable');
  let created: { topicId: string };
  try {
    created = await writer.createTopic(TOPIC_MEMO);
  } catch (e) {
    if (e instanceof HcsPublishError) throw e;
    throw new HcsPublishError('create_failed');
  }
  if (!created || !validTopicId(created.topicId)) throw new HcsPublishError('malformed_receipt');
  return { topicId: created.topicId, submitKey };
}

/** Writes the canonical messages the protected topic is missing, then rereads it. */
export async function publishHcsTrail(
  t: TrustedDeployment,
  id: bigint,
  verified: NetworkResult,
  trusted: TrustedTopic,
  reader: TopicReader,
  writer: TopicWriter,
  options: PublishOptions = {},
): Promise<PublishResult> {
  const attempts = options.confirmAttempts ?? 6;
  const delay = options.confirmDelayMs ?? 3000;
  const sleep = options.sleep ?? defaultSleep;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 20)
    return { status: 'refused', code: 'invalid_options' };
  if (!Number.isSafeInteger(delay) || delay < 0 || delay > 60_000)
    return { status: 'refused', code: 'invalid_options' };
  if (verified.status !== 'verified') return { status: 'refused', code: 'canonical_not_verified' };
  if (!validTopicId(trusted?.topicId) || !validKey(trusted?.submitKey))
    return { status: 'refused', code: 'invalid_trusted_topic' };
  const signing = writerKey(writer);
  if (!signing) return { status: 'refused', code: 'writer_unavailable' };
  // The network would reject a wrong signature anyway; refusing here spends no fee.
  if (!sameKey(signing, trusted.submitKey)) return { status: 'refused', code: 'writer_key_mismatch' };

  const before = await verifyHcsTrail(t, id, verified, trusted, reader);
  if (before.status === 'consistent') return { status: 'up_to_date', check: before };
  if (before.status !== 'incomplete') return { status: 'refused', code: before.code };

  let pending: string[];
  try {
    pending = hcsPending(t, id, verified, before);
  } catch (e) {
    return { status: 'refused', code: e instanceof Error ? e.message : 'invalid_pending' };
  }
  if (pending.length === 0) return { status: 'refused', code: 'nothing_pending' };
  if (pending.length > MAX_PUBLISH_PER_RUN) return { status: 'refused', code: 'too_many_pending' };
  const encoded = pending.map(text => new TextEncoder().encode(text));
  // Defense in depth: every byte string must be the exact canonical encoding.
  if (encoded.some(bytes => parseHcsMessage(bytes) === null))
    return { status: 'refused', code: 'non_canonical_message' };

  const submitted: Submitted[] = [];
  let last = 0;
  for (let i = 0; i < encoded.length; i++) {
    let receipt: { sequence: number; transactionId: string };
    try {
      receipt = await writer.submit(trusted.topicId, encoded[i]!);
    } catch (e) {
      const txStatus = e instanceof HcsPublishError && e.status && STATUS.test(e.status) ? e.status : undefined;
      const code = e instanceof HcsPublishError ? e.code : 'submit_failed';
      return txStatus
        ? { status: 'interrupted', submitted, code, txStatus }
        : { status: 'interrupted', submitted, code };
    }
    if (
      !receipt ||
      !Number.isSafeInteger(receipt.sequence) ||
      receipt.sequence <= last ||
      typeof receipt.transactionId !== 'string' ||
      !TX_ID.test(receipt.transactionId)
    )
      return { status: 'interrupted', submitted, code: 'malformed_receipt' };
    last = receipt.sequence;
    submitted.push({ sequence: receipt.sequence, transactionId: receipt.transactionId, message: pending[i]! });
  }

  // The mirror node lags consensus by a few seconds. Reread until it shows the whole trail.
  let check: HcsResult = before;
  for (let i = 0; i < attempts; i++) {
    if (delay > 0) await sleep(delay);
    check = await verifyHcsTrail(t, id, verified, trusted, reader);
    if (check.status === 'consistent' || check.status === 'mismatch') break;
  }
  return { status: 'published', submitted, confirmed: check.status === 'consistent', check };
}
