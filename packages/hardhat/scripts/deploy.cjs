'use strict';
// Explicit deployment utility. Never imported by tests, startup or installation.
// Only public deployment provenance is written. A testnet key comes from process
// environment, never dotenv, argv, a file or a printed diagnostic.
const fs = require('node:fs');
const path = require('node:path');
const { JsonRpcProvider, Wallet, ContractFactory, keccak256 } = require('ethers');

async function main() {
  const mode = process.argv.slice(2);
  if (mode.length !== 1 || !['--local', '--testnet'].includes(mode[0])) throw new Error('mode_required');
  const local = mode[0] === '--local';
  if (!local && process.env.DELIVERPROOF_TESTNET_AUTHORIZED !== 'yes') throw new Error('explicit_testnet_authorization_required');
  const destination = path.resolve(__dirname, '../../nextjs/lib/deployment.json');
  if (JSON.parse(fs.readFileSync(destination, 'utf8')) !== null) throw new Error('deployment_already_configured');
  const candidate = destination.replace(/\.json$/, '.candidate.json');
  if (fs.existsSync(candidate)) throw new Error('review_existing_candidate_first');
  const artifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/contracts/DeliverProof.sol/DeliverProof.json'), 'utf8'));
  if (artifact.contractName !== 'DeliverProof' || !/^0x[0-9a-f]+$/i.test(artifact.bytecode) || !/^0x[0-9a-f]+$/i.test(artifact.deployedBytecode)) throw new Error('compile_first');
  const provider = new JsonRpcProvider(local ? 'http://127.0.0.1:8545' : 'https://testnet.hashio.io/api');
  try {
    const chainId = Number((await provider.getNetwork()).chainId);
    if (chainId !== (local ? 31337 : 296)) throw new Error('wrong_network');
    let signer;
    if (local) signer = await provider.getSigner(0); // Cloud-only ephemeral unlocked chain; no stored key.
    else {
      const key = process.env.DELIVERPROOF_TESTNET_PRIVATE_KEY;
      if (!key || !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error('testnet_key_missing');
      signer = new Wallet(key, provider);
    }
    const deployer = await signer.getAddress();
    const instance = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
    const tx = instance.deploymentTransaction();
    if (!tx) throw new Error('deployment_transaction_missing');
    // A public hash helps recovery after an interrupted wait; no automatic retry/deploy.
    process.stdout.write(JSON.stringify({ stage: 'submitted-not-confirmed', chainId, deploymentTx: tx.hash }) + '\n');
    const receipt = await provider.waitForTransaction(tx.hash, 1, 120000);
    if (!receipt || receipt.status !== 1 || !receipt.contractAddress || receipt.to !== null) throw new Error('deployment_not_confirmed');
    const address = await instance.getAddress();
    const block = await provider.getBlock(receipt.blockNumber);
    const code = await provider.getCode(address, receipt.blockNumber);
    if (!block || block.hash !== receipt.blockHash || receipt.contractAddress.toLowerCase() !== address.toLowerCase() || receipt.from.toLowerCase() !== deployer.toLowerCase()) throw new Error('deployment_receipt_mismatch');
    if (keccak256(code) !== keccak256(artifact.deployedBytecode)) throw new Error('runtime_code_mismatch');
    const manifest = { chainId, address, deployer, deploymentTx: tx.hash,
      deploymentBlock: String(receipt.blockNumber), runtimeCodeHash: keccak256(artifact.deployedBytecode) };
    // Create a separate candidate first. The operator reviews it before installation.
    fs.writeFileSync(candidate, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write('Confirmed receipt and matching compiled runtime. Public candidate manifest written; review before installing or enabling the UI.\n');
  } finally { provider.destroy(); }
}
main().catch(() => {
  // Never dump library exceptions: RPC/signing errors can contain request material.
  process.stderr.write('Deployment did not complete all checks. No automatic retry. Check mode, authorization, clean compiled artifact, chain and existing manifest. If a public transaction hash was printed, inspect that transaction before retrying.\n');
  process.exitCode = 1;
});
