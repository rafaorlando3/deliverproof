# Primary sources consulted 2026-09-28

- Official brief: https://hedera.com/blog/scaffold-hbar-template-bounty/
- Scaffold-HBAR docs: https://docs.hedera.com/solutions/tools/scaffold-hbar/index
- Official blank template: https://github.com/hedera-dev/scaffold-hbar/tree/templates/blank-template
  Observed commit: 88c8837f451c925476b8250e1281c257022b9bbc.
  Note: the shortened branch name `templates/blank` did not exist when checked.
- CLI manifest schema and package processing: https://github.com/hedera-dev/create-scaffold-hbar
  Inspected src/types.ts and src/tasks/copy-template-files.ts, without running the CLI.
- Hedera unit boundary: https://docs.hedera.com/native/smart-contracts/ethereum-transaction
- CAR block hashes must be independently verified: https://github.com/ipld/js-car
- UnixFS exporter API: https://github.com/ipfs/js-ipfs-unixfs/tree/main/packages/ipfs-unixfs-exporter
- Published packages and peer compatibility checked through https://registry.npmjs.org/

No competitor code copied. Current implementation is original; library usage and
layout conventions are attributed above. Dates describe observation, not test results.
