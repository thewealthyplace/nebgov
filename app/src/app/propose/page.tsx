"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { hashDescription, GovernorClient, type Network } from "@nebgov/sdk";
import { Loader2, Hash, Link as LinkIcon, FileText, AlertCircle } from "lucide-react";
import { useWallet } from "../../../lib/wallet-context";

export default function ProposePage() {
  const router = useRouter();
  const { publicKey, isConnected } = useWallet();
  const [title, setTitle] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [descriptionHash, setDescriptionHash] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-hash full description when it changes
  useEffect(() => {
    if (!fullDescription.trim()) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsHashing(true);
      try {
        const hash = await hashDescription(fullDescription);
        setDescriptionHash(hash);
      } catch (err) {
        console.error("Hashing failed:", err);
      } finally {
        setIsHashing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [fullDescription]);

  const governorClient = useMemo(() => {
    const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
    const timelockAddress = process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS;
    const votesAddress = process.env.NEXT_PUBLIC_VOTES_ADDRESS;
    const network = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as Network;
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

    if (!governorAddress || !timelockAddress || !votesAddress) return null;

    return new GovernorClient({
      governorAddress,
      timelockAddress,
      votesAddress,
      network,
      ...(rpcUrl && { rpcUrl }),
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !metadataUri.trim() || !descriptionHash.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (descriptionHash.length !== 64) {
      setError("Invalid description hash. Must be a 64-character SHA-256 hex string.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // TODO: In a real app, use wallet kit for signing.
      // For now, we simulate the submission.
      console.log("Submitting proposal:", {
        title,
        descriptionHash,
        metadataUri,
      });

      await new Promise((r) => setTimeout(r, 2000));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Proposal</h1>
      <p className="text-gray-500 mb-8">
        Proposals require meeting the proposal threshold in voting power.
      </p>

      {!isConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3 text-sm text-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <p>Please connect your wallet to create a proposal.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-gray-400" /> Title / Brief Summary
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Upgrade protocol fee to 0.3%"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label
            htmlFor="metadataUri"
            className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"
          >
            <LinkIcon className="w-4 h-4 text-gray-400" /> Metadata URI (IPFS or HTTPS)
          </label>
          <input
            id="metadataUri"
            type="text"
            value={metadataUri}
            onChange={(e) => setMetadataUri(e.target.value)}
            placeholder="ipfs://Qm... or https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            required
          />
          <p className="mt-1 text-xs text-gray-400 font-light">
            Points to the full proposal description (markdown or text).
          </p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label
              htmlFor="fullDescription"
              className="block text-sm font-medium text-gray-700 flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-gray-400" /> Full Description (Optional)
            </label>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Used for auto-hashing</span>
          </div>
          <textarea
            id="fullDescription"
            rows={6}
            value={fullDescription}
            onChange={(e) => setFullDescription(e.target.value)}
            placeholder="Paste the full content here to automatically compute the hash..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label
            htmlFor="descriptionHash"
            className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between"
          >
            <div className="flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-gray-400" /> Description SHA-256 Hash
            </div>
            {isHashing && (
              <div className="flex items-center gap-1.5 text-indigo-600 text-[10px] font-bold uppercase tracking-wider">
                <Loader2 className="w-3 h-3 animate-spin" /> Computing...
              </div>
            )}
          </label>
          <input
            id="descriptionHash"
            type="text"
            value={descriptionHash}
            onChange={(e) => setDescriptionHash(e.target.value)}
            placeholder="64-character hex hash"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono bg-gray-50"
            required
          />
          <p className="mt-1 text-xs text-gray-400 font-light">
            Hash of the UTF-8 encoded description text.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim() || !metadataUri.trim() || isHashing || !isConnected}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : isConnected ? "Submit Proposal" : "Connect Wallet to Submit"}
        </button>
      </form>
    </div>
  );
}
