# Deployed Contracts

This page lists the official contract addresses for NebGov deployments across various networks.

## Testnet

| Contract | Address | Deployed At | Version |
|---|---|---|---|
| Governor | `CD6A6S4E...` | Ledger 54000 | v0.1.0 |
| Timelock | `CDEF7G8H...` | Ledger 54001 | v0.1.0 |
| Token Votes | `C9IJ0K1L...` | Ledger 54002 | v0.1.0 |
| Treasury | `CMNO2P3Q...` | Ledger 54003 | v0.1.0 |
| Governor Factory | `CSTU4V5W...` | Ledger 54004 | v0.1.0 |

## Mainnet

_Not yet deployed._

## How to Verify

All contract WASM hashes can be verified against the release artifacts using the Stellar CLI:

```bash
stellar contract info --network testnet --id <CONTRACT_ID>
```

The output should contain a `Hash` field that matches the SHA-256 hash of the optimized `.wasm` file provided in the [GitHub Releases](https://github.com/nebgov/nebgov/releases).

## Historical Deployments

Previous addresses (superseded by upgrades):

| Contract | Old Address | Upgraded At |
|---|---|---|
| - | - | - |
