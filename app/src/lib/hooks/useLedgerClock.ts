"use client";

import { useState, useEffect } from "react";
import { SorobanRpc } from "@stellar/stellar-sdk";

interface LedgerClock {
  currentLedger: number;
  isLoading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 30000;

export function useLedgerClock(rpcUrl?: string): LedgerClock {
  const [currentLedger, setCurrentLedger] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const url =
      rpcUrl ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      "https://soroban-testnet.stellar.org";
    const server = new SorobanRpc.Server(url, { allowHttp: false });

    async function fetchLedger() {
      try {
        const health = await server.getHealth();
        if (health.status === "healthy") {
          const ledgerInfo = await server.getLatestLedger();
          setCurrentLedger(ledgerInfo.sequence);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch ledger"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchLedger();
    const interval = setInterval(fetchLedger, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [rpcUrl]);

  return { currentLedger, isLoading, error };
}
