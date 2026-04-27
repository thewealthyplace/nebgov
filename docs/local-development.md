# Local Development Setup

This guide walks you through getting the full NebGov stack running locally — contracts, indexer, backend, and frontend.

**Estimated time:** ~30 minutes for a developer with Rust + Node experience.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | stable | [rustup.rs](https://rustup.rs) |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| stellar-cli | matching `soroban-sdk = 22.0.0` | see below |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm@9` |
| Docker | any recent | [docs.docker.com](https://docs.docker.com/get-docker/) |
| A funded Stellar testnet account | — | see below |

---

## Step-by-step Setup

### 1. Clone the repo

```bash
git clone https://github.com/nebgov/nebgov.git
cd nebgov
```

### 2. Install Rust and the wasm32 target

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
```

### 3. Install Stellar CLI

The contracts use `soroban-sdk = 22.0.0`, so you need a matching CLI version:

```bash
cargo install --locked stellar-cli --version 22.0.0
```

Verify:

```bash
stellar --version
# stellar 22.x.x
```

> For the full Stellar CLI reference, see the [official docs](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli).

### 4. Build the contracts

```bash
cargo build --release --target wasm32-unknown-unknown
```

### 5. Run contract tests

```bash
cargo test --workspace
```

### 6. Install JS dependencies

```bash
pnpm install
```

### 7. Configure environment variables

Each package has an `.env.example`. Copy and fill them in:

```bash
cp .env.example .env
cp app/.env.local.example app/.env.local
cp backend/.env.example backend/.env
cp packages/indexer/.env.example packages/indexer/.env
```

Edit each `.env` file. The key variables are:

**`backend/.env`**
```
DATABASE_URL=postgres://nebgov:nebgov@localhost:5432/nebgov
JWT_SECRET=your-local-secret
PORT=3001
```

**`packages/indexer/.env`**
```
DATABASE_URL=postgres://nebgov:nebgov@localhost:5432/nebgov
GOVERNOR_ADDRESS=<deployed contract address>
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
PORT=3002
```

**`app/.env.local`**
```
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_GOVERNOR_ADDRESS=<deployed contract address>
NEXT_PUBLIC_TIMELOCK_ADDRESS=<deployed contract address>
NEXT_PUBLIC_VOTES_ADDRESS=<deployed contract address>
```

### 8. Start Postgres

```bash
docker compose -f packages/indexer/docker-compose.yml up -d db
```

### 9. Run database migrations

```bash
cd backend && pnpm migrate
```

### 10. Deploy contracts to testnet (optional for local UI dev)

First, create and fund a testnet account:

```bash
stellar keys generate --global local-deployer --network testnet
stellar keys fund local-deployer --network testnet
```

Then deploy:

```bash
chmod +x scripts/deploy-testnet.sh
STELLAR_IDENTITY=local-deployer STELLAR_NETWORK=testnet ./scripts/deploy-testnet.sh
```

The script writes deployed addresses to `.env.testnet`. Copy those values into your `.env` files.

### 11. Start the indexer

```bash
cd packages/indexer && pnpm dev
```

### 12. Start the backend

```bash
cd backend && pnpm dev
```

### 13. Start the frontend

```bash
cd app && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Troubleshooting

### Wrong stellar-cli version

**Error:** `error[E0308]: mismatched types` or `soroban_sdk version mismatch`

**Fix:** The contracts require `stellar-cli` matching `soroban-sdk = 22.0.0`. Install the exact version:

```bash
cargo install --locked stellar-cli --version 22.0.0
```

### Missing wasm32 target

**Error:** `error[E0463]: can't find crate for 'core'` or `the target 'wasm32-unknown-unknown' may not be installed`

**Fix:**

```bash
rustup target add wasm32-unknown-unknown
```

### Unfunded testnet account

**Error:** `HostError: Error(Auth, InvalidAction)` or transaction fails with insufficient balance

**Fix:** Fund your account via Friendbot:

```bash
stellar keys fund <your-key-name> --network testnet
```

Or use the [Stellar Friendbot](https://friendbot.stellar.org) directly with your public key.

---

## Useful Links

- [Soroban docs](https://developers.stellar.org/docs/build/smart-contracts/overview)
- [Stellar CLI reference](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
