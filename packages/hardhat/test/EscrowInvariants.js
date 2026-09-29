// Additional escrow checks, independent of the main contract tests:
// 1) Solidity vs TypeScript cross-check: moved to packages/core/test-chain/commitment-cross.chain.ts
//    (npm run chain:test), so this suite does not depend on Node >= 22.18 (type stripping);
// 2) liability invariant under a pseudo-random sequence (fixed seed) of legitimate and
//    improper calls, with time jumps;
// 3) another agreement's commitment never approves this one.
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

let CID, sha256;
// Scope: the before hook below runs only for this file's tests, not for the whole Hardhat suite.
describe('Escrow invariants', function () {
  before(async function () {
    ({ CID } = await import('multiformats/cid'));
    ({ sha256 } = await import('multiformats/hashes/sha2'));
  });

  async function file(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await sha256.digest(bytes);
    return {
      bytes,
      sha: ethers.hexlify(digest.digest),
      rawCid: CID.createV1(0x55, digest).toString(),
      pbCid: CID.createV1(0x70, digest).toString(),
    };
  }

  describe('per-agreement commitment', function () {
    it('the commitment of another agreement, for the same file, does not approve this one', async function () {
      const [buyer, supplier] = await ethers.getSigners();
      const dp = await (await ethers.getContractFactory('DeliverProof')).deploy();
      const f = await file('mesmo arquivo');
      const now = (await ethers.provider.getBlock('latest')).timestamp;
      const terms = ethers.id('mesmos termos');
      for (const i of [1, 2]) {
        await dp.createAgreement(supplier.address, 500n, now + 100, now + 200, terms);
        await dp.fund(i, { value: 500n });
        await dp.connect(supplier).submit(i, f.rawCid, f.sha, f.bytes.length, 1);
      }
      const c1 = (await dp.getAgreement(1)).commitment,
        c2 = (await dp.getAgreement(2)).commitment;
      expect(c1).to.not.equal(c2);
      await expect(dp.approve(1, c2)).to.be.revertedWithCustomError(dp, 'WrongCommitment');
      await dp.approve(1, c1);
    });
  });

  describe('liability invariant under a pseudo-random sequence', function () {
    it('balance = locked + credits at every step; each agreement pays at most once; improper calls revert', async function () {
      this.timeout(120000);
      const signers = await ethers.getSigners();
      const [b1, s1, b2, s2, stranger] = signers;
      const dp = await (await ethers.getContractFactory('DeliverProof')).deploy();
      const addr = await dp.getAddress();
      // mulberry32 with a fixed seed (an LCG modulo 2^31 has periodic low bits and biased the sequence)
      let seed = 20260928 >>> 0;
      const rnd = n => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) % n;
      };
      const f = await file('invariante');
      const now0 = (await ethers.provider.getBlock('latest')).timestamp;
      const ags = [];
      for (let i = 0; i < 6; i++) {
        const [buyer, supplier] = i % 2 ? [b2, s2] : [b1, s1];
        const amount = BigInt(1 + rnd(1_000_000_000));
        await dp
          .connect(buyer)
          .createAgreement(supplier.address, amount, now0 + 300 + i * 50, now0 + 600 + i * 50, ethers.id(`t${i}`));
        ags.push({ id: i + 1, buyer, supplier, amount, paid: 0n });
      }
      const everyone = [b1, s1, b2, s2, stranger];
      const check = async () => {
        const bal = await ethers.provider.getBalance(addr);
        expect(bal).to.equal((await dp.totalLocked()) + (await dp.totalCredits()));
        for (const a of ags) expect(a.paid <= a.amount).to.equal(true);
      };
      let okCalls = 0,
        reverted = 0;
      for (let step = 0; step < 220; step++) {
        const a = ags[rnd(ags.length)];
        const op = rnd(7);
        // 70% of the time the account with the right role for the operation; 30% anyone (including a stranger)
        const st = Number((await dp.getAgreement(a.id)).state);
        const right =
          op === 0 || op === 2
            ? a.buyer
            : op === 1
              ? a.supplier
              : op === 3
                ? rnd(2)
                  ? a.buyer
                  : a.supplier
                : op === 4
                  ? st === 5
                    ? a.buyer
                    : a.supplier
                  : a.buyer;
        const who = rnd(10) < 7 ? right : everyone[rnd(everyone.length)];
        try {
          if (op === 0) await dp.connect(who).fund(a.id, { value: rnd(4) === 0 ? a.amount + 1n : a.amount });
          else if (op === 1) await dp.connect(who).submit(a.id, f.rawCid, f.sha, f.bytes.length, 1);
          else if (op === 2) await dp.connect(who).approve(a.id, (await dp.getAgreement(a.id)).commitment);
          else if (op === 3) await dp.connect(who).refund(a.id);
          else if (op === 4) {
            const before = await ethers.provider.getBalance(addr);
            await dp.connect(who).withdraw(a.id);
            a.paid += before - (await ethers.provider.getBalance(addr));
          } else if (op === 5) {
            await network.provider.send('evm_increaseTime', [rnd(60)]);
            await network.provider.send('evm_mine', []);
          } else await who.sendTransaction({ to: addr, value: 1n });
          okCalls++;
        } catch (e) {
          reverted++;
        }
        await check();
      }
      // at the end, every released credit can be withdrawn once by the right beneficiary and nothing stays wrongly locked
      for (const a of ags) {
        const st = Number((await dp.getAgreement(a.id)).state);
        if ((st === 4 || st === 5) && !(await dp.getAgreement(a.id)).withdrawn) {
          const who = st === 4 ? a.supplier : a.buyer;
          const before = await ethers.provider.getBalance(addr);
          await dp.connect(who).withdraw(a.id);
          a.paid += before - (await ethers.provider.getBalance(addr));
          await expect(dp.connect(who).withdraw(a.id)).to.be.revertedWithCustomError(dp, 'AlreadyWithdrawn');
        }
        await check();
      }
      const finals = [];
      for (const a of ags) finals.push(Number((await dp.getAgreement(a.id)).state));
      expect(finals).to.include(4); // at least one approved and withdrawn by the supplier
      expect(finals).to.include(5); // at least one refunded and withdrawn by the buyer
      for (const [i, a] of ags.entries()) if (finals[i] === 4 || finals[i] === 5) expect(a.paid).to.equal(a.amount);
      expect(await dp.totalCredits()).to.equal(0n);
      expect(okCalls).to.be.greaterThan(10);
      expect(reverted).to.be.greaterThan(10);
    });
  });
});
