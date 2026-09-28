// Provas adicionais da revisão do Claude (M1). Independentes dos testes do Codex:
// 1) vetor cruzado: o compromisso gravado pelo contrato (Solidity, abi.encode) é byte a byte igual ao
//    calculado por packages/core/src/delivery.ts (viem), importado direto do fonte TypeScript;
// 2) invariante de passivos sob uma sequência pseudoaleatória (semente fixa) de chamadas legítimas e
//    indevidas, com saltos de tempo;
// 3) compromisso de outro acordo nunca aprova este.
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

let core, CID, sha256
before(async function () {
  try { core = await import('../../core/src/delivery.ts') }
  catch (e) { throw new Error(`precisa de Node >= 22.18 (type stripping) para importar o fonte TS do core: ${e.message}`) }
  ;({ CID } = await import('multiformats/cid'))
  ;({ sha256 } = await import('multiformats/hashes/sha2'))
})

async function file(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await sha256.digest(bytes)
  return { bytes, sha: ethers.hexlify(digest.digest), rawCid: CID.createV1(0x55, digest).toString(), pbCid: CID.createV1(0x70, digest).toString() }
}

describe('Claude (revisão M1): compromisso Solidity x TypeScript', function () {
  it('mesmos bytes nos dois lados, para vários tamanhos, tipos, codecs e acordos', async function () {
    const [buyer, supplier] = await ethers.getSigners()
    const dp = await (await ethers.getContractFactory('DeliverProof')).deploy()
    const addr = await dp.getAddress()
    const cases = [
      { text: 'a', media: 1 }, { text: 'Relatório sintético\n', media: 2 }, { text: 'x'.repeat(5000), media: 3 },
    ]
    let id = 0
    for (const c of cases) for (const codec of ['raw', 'pb']) {
      const f = await file(c.text)
      const cid = codec === 'raw' ? f.rawCid : f.pbCid
      const now = (await ethers.provider.getBlock('latest')).timestamp
      const terms = ethers.id(`termos ${id}`)
      await dp.createAgreement(supplier.address, 1_000n + BigInt(id), now + 100, now + 200, terms)
      id++
      await dp.fund(id, { value: 1_000n + BigInt(id - 1) })
      const tx = await dp.connect(supplier).submit(id, cid, f.sha, f.bytes.length, c.media)
      const onchain = (await dp.getAgreement(id)).commitment
      const ts = core.deliveryCommitment({ chainId: 31337, contract: addr, agreementId: BigInt(id), termsHash: terms, cid, fileSha256: f.sha, fileSize: BigInt(f.bytes.length), mediaType: c.media, version: 1 })
      expect(ts).to.equal(onchain)
      await expect(tx).to.emit(dp, 'Submitted').withArgs(id, onchain, cid, f.sha, f.bytes.length, c.media, 1)
    }
  })

  it('compromisso de outro acordo, com o mesmo arquivo, não aprova este', async function () {
    const [buyer, supplier] = await ethers.getSigners()
    const dp = await (await ethers.getContractFactory('DeliverProof')).deploy()
    const f = await file('mesmo arquivo')
    const now = (await ethers.provider.getBlock('latest')).timestamp
    const terms = ethers.id('mesmos termos')
    for (const i of [1, 2]) { await dp.createAgreement(supplier.address, 500n, now + 100, now + 200, terms); await dp.fund(i, { value: 500n }); await dp.connect(supplier).submit(i, f.rawCid, f.sha, f.bytes.length, 1) }
    const c1 = (await dp.getAgreement(1)).commitment, c2 = (await dp.getAgreement(2)).commitment
    expect(c1).to.not.equal(c2)
    await expect(dp.approve(1, c2)).to.be.revertedWithCustomError(dp, 'WrongCommitment')
    await dp.approve(1, c1)
  })
})

describe('Claude (revisão M1): invariante de passivos sob sequência pseudoaleatória', function () {
  it('saldo = travado + créditos a cada passo; cada acordo paga no máximo uma vez; indevidos revertem', async function () {
    this.timeout(120000)
    const signers = await ethers.getSigners()
    const [b1, s1, b2, s2, stranger] = signers
    const dp = await (await ethers.getContractFactory('DeliverProof')).deploy()
    const addr = await dp.getAddress()
    // mulberry32 com semente fixa (um LCG módulo 2^31 tem bits baixos periódicos e deixava a sequência viciada)
    let seed = 20260928 >>> 0
    const rnd = n => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) % n) }
    const f = await file('invariante')
    const now0 = (await ethers.provider.getBlock('latest')).timestamp
    const ags = []
    for (let i = 0; i < 6; i++) {
      const [buyer, supplier] = i % 2 ? [b2, s2] : [b1, s1]
      const amount = BigInt(1 + rnd(1_000_000_000))
      await dp.connect(buyer).createAgreement(supplier.address, amount, now0 + 300 + i * 50, now0 + 600 + i * 50, ethers.id(`t${i}`))
      ags.push({ id: i + 1, buyer, supplier, amount, paid: 0n })
    }
    const everyone = [b1, s1, b2, s2, stranger]
    const check = async () => {
      const bal = await ethers.provider.getBalance(addr)
      expect(bal).to.equal((await dp.totalLocked()) + (await dp.totalCredits()))
      for (const a of ags) expect(a.paid <= a.amount).to.equal(true)
    }
    let okCalls = 0, reverted = 0
    for (let step = 0; step < 220; step++) {
      const a = ags[rnd(ags.length)]
      const op = rnd(7)
      // 70% das vezes quem tem o papel certo para a operação; 30% qualquer um (inclusive estranho)
      const st = Number((await dp.getAgreement(a.id)).state)
      const right = op === 0 || op === 2 ? a.buyer : op === 1 ? a.supplier : op === 3 ? (rnd(2) ? a.buyer : a.supplier) : op === 4 ? (st === 5 ? a.buyer : a.supplier) : a.buyer
      const who = rnd(10) < 7 ? right : everyone[rnd(everyone.length)]
      try {
        if (op === 0) await dp.connect(who).fund(a.id, { value: rnd(4) === 0 ? a.amount + 1n : a.amount })
        else if (op === 1) await dp.connect(who).submit(a.id, f.rawCid, f.sha, f.bytes.length, 1)
        else if (op === 2) await dp.connect(who).approve(a.id, (await dp.getAgreement(a.id)).commitment)
        else if (op === 3) await dp.connect(who).refund(a.id)
        else if (op === 4) {
          const before = await ethers.provider.getBalance(addr)
          await dp.connect(who).withdraw(a.id)
          a.paid += before - (await ethers.provider.getBalance(addr))
        }
        else if (op === 5) { await network.provider.send('evm_increaseTime', [rnd(60)]); await network.provider.send('evm_mine', []) }
        else await who.sendTransaction({ to: addr, value: 1n })
        okCalls++
      } catch (e) { reverted++ }
      await check()
    }
    // no fim, todo crédito liberado pode ser sacado uma vez pelo beneficiário certo e nada sobra travado indevidamente
    for (const a of ags) {
      const st = Number((await dp.getAgreement(a.id)).state)
      if ((st === 4 || st === 5) && !(await dp.getAgreement(a.id)).withdrawn) {
        const who = st === 4 ? a.supplier : a.buyer
        const before = await ethers.provider.getBalance(addr)
        await dp.connect(who).withdraw(a.id)
        a.paid += before - (await ethers.provider.getBalance(addr))
        await expect(dp.connect(who).withdraw(a.id)).to.be.revertedWithCustomError(dp, 'AlreadyWithdrawn')
      }
      await check()
    }
    const finals = []
    for (const a of ags) finals.push(Number((await dp.getAgreement(a.id)).state))
    console.log('      estados finais:', finals.join(','), '| pagos:', ags.map(a => a.paid.toString()).join(','), '| chamadas ok/revertidas:', okCalls, reverted)
    expect(finals).to.include(4) // pelo menos um aprovado e sacado pelo fornecedor
    expect(finals).to.include(5) // pelo menos um devolvido e sacado pelo comprador
    for (const [i, a] of ags.entries()) if (finals[i] === 4 || finals[i] === 5) expect(a.paid).to.equal(a.amount)
    expect(await dp.totalCredits()).to.equal(0n)
    expect(okCalls).to.be.greaterThan(10)
    expect(reverted).to.be.greaterThan(10)
  })
})
