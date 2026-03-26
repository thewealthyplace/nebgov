# Tutorial: Deploy your first DAO on Stellar with NebGov in 10 minutes

Welcome to NebGov! In this tutorial, you'll go from zero to a fully functioning on-chain DAO. By the end, you will have deployed your own governance contracts, created a proposal, voted on it, and executed it through your own DAO dashboard—all running on the Stellar testnet.

## What You'll Build

A fully on-chain DAO featuring:
- **Token-weighted voting** using a SEP-41 snapshot token.
- **Time-locked execution** ensuring a mandatory delay before changes go live.
- **A Governance Dashboard** pointing at your freshly deployed contracts.

---

## 1. Prerequisites

Before we start, verify you have the necessary tools installed:

1. **Rust and Cargo**: [Install Rust](https://rustup.rs/).
2. **Stellar CLI**: Install the official CLI via Cargo.
   ```bash
   cargo install stellar-cli --locked
   ```
3. **Node.js and pnpm**: Install Node.js (v18+) and [pnpm](https://pnpm.io/installation).
   ```bash
   npm install -g pnpm
   ```

Clone the NebGov repository and navigate into it:
```bash
git clone https://github.com/nebgov/nebgov
cd nebgov
```

---

## 2. Generate and Fund a Testnet Account

Let's create a testnet identity called `deployer` and fund it using Friendbot.

```bash
stellar keys generate --global deployer --network testnet
stellar keys fund deployer --network testnet
```

Get your public key (you'll need it a lot):
```bash
stellar keys address deployer
```

> **Note:** Whenever you see `$(stellar keys address deployer)`, the command is automatically injecting your public key. If you are on Windows PowerShell, you might need to run `stellar keys address deployer` and manually copy-paste the address into the following commands.

---

## 3. Build Contracts

Compile all the NebGov Soroban smart contracts into `.wasm` binaries.

```bash
cargo build --release --target wasm32-unknown-unknown
```

This takes a minute. Once done, all your compiled contracts will be sitting under `target/wasm32-unknown-unknown/release/`.

---

## 4. Deploy the Token-Votes Contract

Your DAO needs a governance token. The `sorogov_token_votes` contract wraps a standard SEP-41 token and adds checkpointing capabilities so voting power can be securely snapshotted.

For this tutorial, we will use the native testnet XLM address (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) as our underlying token.

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/sorogov_token_votes.wasm \
  --source deployer \
  --network testnet \
  -- \
  --admin $(stellar keys address deployer) \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

*Example output:*
```text
CBUXRZGBH2M3N4XGBOOUU5JIK75XUODX2J23P3J4F5J6I7O8R9T0Z1Y2
```

**✅ Action:** Copy the returned `C...` address and save it. This is your `VOTES_ADDRESS`.

---

## 5. Deploy the Timelock Contract

The Timelock forces a delay between when a proposal passes and when it can be executed, giving users time to react to governance decisions. 

We will deploy it with a minimum delay of 1 hour (3600 seconds). As a placeholder for the governor address, we'll use your deployer address for now.

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/sorogov_timelock.wasm \
  --source deployer \
  --network testnet \
  -- \
  --admin $(stellar keys address deployer) \
  --governor $(stellar keys address deployer) \
  --min_delay 3600
```

*Example output:*
```text
CCWX2ZB... (your timelock address)
```

**✅ Action:** Copy the returned `C...` address and save it. This is your `TIMELOCK_ADDRESS`.

---

## 6. Deploy the Governor Contract

The Governor contract ties everything together. It coordinates proposals, tracks the voting period, and interfaces with the Tokens and Timelock.

Replace `$VOTES_ADDRESS` and `$TIMELOCK_ADDRESS` with the addresses you saved earlier.

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/sorogov_governor.wasm \
  --source deployer \
  --network testnet \
  -- \
  --admin $(stellar keys address deployer) \
  --votes_token $VOTES_ADDRESS \
  --timelock $TIMELOCK_ADDRESS \
  --voting_delay 60 \
  --voting_period 17280 \
  --quorum_numerator 4 \
  --proposal_threshold 100000000
```

*Example output:*
```text
CDEX3YC... (your governor address)
```

**✅ Action:** Copy the returned `C...` address and save it. This is your `GOVERNOR_ADDRESS`.

> **Note:** The values initialized represent: a 60-second voting delay, roughly a 1-day voting period (assuming ~5s ledgers), a 4% quorum requirement, and a 10-token proposal threshold (accounting for 7 decimal places).

---

## 7. Mint Tokens and Delegate

Before you can create a proposal or vote, you need voting power. In standard OpenZeppelin-style governance, *you must delegate your tokens* to activate them in the checkpoints. 

You can self-delegate using the `stellar contract invoke` command. Replace `$VOTES_ADDRESS` with your token-votes address.

```bash
stellar contract invoke \
  --id $VOTES_ADDRESS \
  --source deployer \
  --network testnet \
  -- delegate \
  --delegatee $(stellar keys address deployer)
```

*Example output:*
```text
null
```

Now your voting power is activated and will be correctly snapshotted!

---

## 8. Create a Proposal, Vote, and Execute (via SDK)

To interact with the full lifecycle safely, we'll use a small script with NebGov's TypeScript SDK. This makes serializing operations much easier than the CLI.

Create a temporary folder and script file to run the proposal lifecycle:

```bash
mkdir my-dao-script && cd my-dao-script
npm init -y
npm install @nebgov/sdk @stellar/stellar-sdk
touch run-dao.js
```

Paste the following into `run-dao.js`. **Remember to replace the placeholders at the top** with your deployed addresses, and use a testnet Secret Key starting with `S` (you can generate a new one or export your deployer secret using `stellar keys show deployer`):

```javascript
import { GovernorClient } from "@nebgov/sdk";
import { Keypair } from "@stellar/stellar-sdk";

// ⚠️ Replace with your actual addresses
const GOVERNOR_ADDRESS = "C_YOUR_GOVERNOR_ADDRESS";
const TIMELOCK_ADDRESS = "C_YOUR_TIMELOCK_ADDRESS";
const VOTES_ADDRESS = "C_YOUR_VOTES_ADDRESS";
const SECRET_KEY = "S_YOUR_SECRET_KEY";

async function main() {
  const signer = Keypair.fromSecret(SECRET_KEY);
  
  const client = new GovernorClient({
    governorAddress: GOVERNOR_ADDRESS,
    timelockAddress: TIMELOCK_ADDRESS,
    votesAddress: VOTES_ADDRESS,
    network: "testnet",
  });

  console.log("Creating proposal...");
  const proposalId = await client.propose(signer, "Allocate funds to NebGov contributors");
  console.log("✅ Proposal created with ID:", proposalId);
  
  // Note: Depending on your 'voting_delay' setup, you'd typically wait here before voting.
  console.log("Voting in favor...");
  await client.castVote(signer, proposalId, 1); // 1 = For
  console.log("✅ Voted 'For'!");
}

main().catch(console.error);
```

Run the script to create your first ever proposal:
```bash
node run-dao.js
```

---

## 9. Launch the Dashboard

Finally, let's view your DAO in the React frontend. If you navigated into `my-dao-script`, go back to the repository root.

Install dependencies for the frontend application:
```bash
pnpm install
```

Copy the environment config:
```bash
cp app/.env.example app/.env.local
```

Open `app/.env.local` in your editor and input the contract addresses you deployed.

Start the app locally:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see your DAO interface and the "Allocate funds to NebGov contributors" proposal you just created!

🎉 **Congratulations!** You have fully deployed an on-chain DAO to the Stellar testnet.

---

## Troubleshooting

Here are the top 5 common errors you might encounter, and how to fix them:

### 1. Account has insufficient XLM / Testnet account not funded
**Error:** `op_underfunded` or `account not found`
**Fix:** Ensure you strictly ran `stellar keys fund deployer --network testnet`. If that fails, go to [Friendbot](https://laboratory.stellar.org/#account-creator?network=test) and paste your deployer address manually to fund it.

### 2. Sequence number mismatch (Tx Failed)
**Error:** `tx_bad_seq`
**Fix:** You might have sent transactions too quickly. The Stellar CLI handles this automatically most of the time, but if you hit this, just wait 5 seconds and resubmit the command.

### 3. Missing WASM files
**Error:** `No such file or directory: target/wasm32-unknown-unknown/release/...`
**Fix:** Did you run the `cargo build` command in step 3? Make sure you ran `cargo build --release --target wasm32-unknown-unknown` from the repository root.

### 4. Need to activate voting power (Proposal Creation Fails)
**Error:** `GovernorThresholdNotMet` or similar threshold issues
**Fix:** You must delegate your tokens to yourself for them to count towards your governor proposal threshold. Rerun the command in Step 7 (`stellar contract invoke ... delegate`).

### 5. Node.js Dependency Errors (Frontend)
**Error:** `ERR_PNPM_NO_MATCHING_VERSION` or build errors when starting the frontend
**Fix:** Make sure you are using Node 18 or higher. Check your Node version with `node -v` and update if necessary. Try deleting `node_modules` and re-running `pnpm install`.
