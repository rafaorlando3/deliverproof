// Sobe um `hardhat node` local numa porta livre, só em 127.0.0.1, e devolve a URL.
// A saída do nó fica em memória (ele imprime as chaves públicas de teste do Hardhat);
// nada vai para arquivo de log.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const hardhatDir = path.resolve(here, '../../hardhat');
const bin = path.resolve(here, '../../../node_modules/.bin/hardhat');

export function artifact(name = 'DeliverProof') {
  return JSON.parse(readFileSync(path.join(hardhatDir, `artifacts/contracts/${name}.sol/${name}.json`), 'utf8'));
}

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer(); s.once('error', fail);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); });
  });
}

export async function startNode(): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const child: ChildProcess = spawn(bin, ['node', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: hardhatDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('hardhat node did not start in 60s:\n' + out.slice(-2000))), 60_000);
    const on = (b: Buffer) => { out += b.toString(); if (out.includes('Started HTTP')) { clearTimeout(t); ok(); } };
    child.stdout!.on('data', on); child.stderr!.on('data', on);
    child.once('exit', c => { clearTimeout(t); fail(new Error(`hardhat node exited ${c}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(ok => { child.once('exit', () => ok()); child.kill('SIGTERM'); }),
  };
}
