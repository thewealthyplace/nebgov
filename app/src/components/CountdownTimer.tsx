"use client";

import { useState, useEffect } from "react";
import { ledgerToEstimatedDate, formatCountdown, getProposalTimeInfo, type ProposalTimeInfo } from "../lib/utils/ledgerTime";
import { useLedgerClock } from "../lib/hooks/useLedgerClock";

interface CountdownTimerProps {
  state: string;
  startLedger: number;
  endLedger: number;
  vetoWindowCloseLedger?: number;
}

export function CountdownTimer({ state, startLedger, endLedger, vetoWindowCloseLedger }: CountdownTimerProps) {
  const { currentLedger, isLoading } = useLedgerClock();
  const [displayText, setDisplayText] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [targetLedger, setTargetLedger] = useState<number>(0);

  useEffect(() => {
    const timeInfo = getProposalTimeInfo(state, startLedger, endLedger, currentLedger, vetoWindowCloseLedger);
    if (!timeInfo) {
      setDisplayText("");
      setLabel("");
      return;
    }

    setLabel(timeInfo.label);
    setTargetLedger(timeInfo.targetLedger);

    const updateCountdown = () => {
      const estimatedDate = ledgerToEstimatedDate(timeInfo.targetLedger, currentLedger);
      setDisplayText(formatCountdown(estimatedDate));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [state, startLedger, endLedger, currentLedger, vetoWindowCloseLedger]);

  if (isLoading || !displayText) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-sm" title={`Target ledger: ${targetLedger}`}>
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{displayText}</span>
      <span className="text-xs text-gray-400 ml-1">(estimated)</span>
    </div>
  );
}
