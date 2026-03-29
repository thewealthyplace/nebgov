"use client";

/**
 * Four-step proposal wizard: basics → actions (optional) → review → success.
 * Updated with SHA-256 hashing and metadata URI support.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, Share2, Loader2, Hash, Link as LinkIcon, FileText, AlertCircle } from "lucide-react";
import { GovernorClient, VotesClient, hashDescription, type Network } from "@nebgov/sdk";
import {
  calldataArgRowToScVal,
  encodeGovernorCalldataBytes,
  newArgRow,
  type CalldataArgRow,
} from "../../lib/treasury-calldata";
import { useWallet } from "../../lib/wallet-context";

const STORAGE_KEY = "nebgov-propose-wizard-v1";
const TITLE_MIN = 10;
const TITLE_MAX = 120;
const DESC_MIN = 100;

const STEPS = [
  { id: 1, label: "Basics" },
  { id: 2, label: "Actions" },
  { id: 3, label: "Review" },
  { id: 4, label: "Done" },
] as const;

type WizardAction = {
  id: string;
  target: string;
  fnName: string;
  args: CalldataArgRow[];
  simulateOk: boolean | null;
  simulateError?: string;
};

type Draft = {
  title: string;
  description: string;
  descriptionHash: string;
  ipfsRef: string;
  actions: WizardAction[];
};

function newAction(): WizardAction {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    target: "",
    fnName: "",
    args: [],
    simulateOk: null,
  };
}

function loadDraft(): Draft {
  if (typeof window === "undefined") {
    return { title: "", description: "", descriptionHash: "", ipfsRef: "", actions: [] };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw)
      return { title: "", description: "", descriptionHash: "", ipfsRef: "", actions: [] };
    const p = JSON.parse(raw) as Partial<Draft>;
    return {
      title: typeof p.title === "string" ? p.title : "",
      description: typeof p.description === "string" ? p.description : "",
      descriptionHash: typeof p.descriptionHash === "string" ? p.descriptionHash : "",
      ipfsRef: typeof p.ipfsRef === "string" ? p.ipfsRef : "",
      actions: Array.isArray(p.actions)
        ? p.actions.map((a) => ({
          id: String(a.id ?? newAction().id),
          target: String(a.target ?? ""),
          fnName: String(a.fnName ?? ""),
          args: Array.isArray(a.args)
            ? a.args.map((r) => {
              const row = r as CalldataArgRow;
              const k = String(row.kind);
              const kind = (
                ["address", "i128", "u64", "string", "bool"].includes(k)
                  ? k
                  : "address"
              ) as CalldataArgRow["kind"];
              return {
                id: String(row.id ?? newArgRow().id),
                kind,
                value: String(row.value ?? ""),
              };
            })
            : [],
          simulateOk:
            typeof a.simulateOk === "boolean" || a.simulateOk === null
              ? a.simulateOk
              : null,
          simulateError:
            typeof a.simulateError === "string" ? a.simulateError : undefined,
        }))
        : [],
    };
  } catch {
    return { title: "", description: "", descriptionHash: "", ipfsRef: "", actions: [] };
  }
}

function saveDraft(d: Draft) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function buildDescription(title: string, body: string, ipfs: string): string {
  let s = `${title.trim()}\n\n${body.trim()}`;
  // We keep the IPFS ref in the metadata field now, but we can also append it to the text for legacy clients.
  // For now, let's keep it strictly in the metadata Uri contract field for simplicity.
  return s;
}

function isReasonableIpfsRef(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^ipfs:\/\/.+/i.test(t)) return true;
  if (/^https?:\/\/.+/i.test(t)) return true;
  if (/^baf[a-z2-7]+$/i.test(t)) return true;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/.test(t)) return true;
  return false;
}

function getClients() {
  const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
  const timelockAddress = process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS;
  const votesAddress = process.env.NEXT_PUBLIC_VOTES_ADDRESS;
  const network = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as Network;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  if (!governorAddress || !timelockAddress || !votesAddress) return null;
  const cfg = {
    governorAddress,
    timelockAddress,
    votesAddress,
    network,
    ...(rpcUrl ? { rpcUrl } : {}),
  };
  return {
    governor: new GovernorClient(cfg),
    votes: new VotesClient(cfg),
    governorAddress,
  };
}

function buildPayload(
  actions: WizardAction[],
  governorAddress: string
): { targets: string[]; fnNames: string[]; calldatas: Buffer[] } {
  if (actions.length === 0) {
    return {
      targets: [governorAddress],
      fnNames: ["proposal_count"],
      calldatas: [Buffer.alloc(0)],
    };
  }
  return {
    targets: actions.map((a) => a.target.trim()),
    fnNames: actions.map((a) => a.fnName.trim()),
    calldatas: actions.map((a) => Buffer.from(encodeGovernorCalldataBytes(a.args))),
  };
}

function ProposeWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, isConnected, signTransaction } = useWallet();

  const step = Math.min(
    4,
    Math.max(1, Number.parseInt(searchParams.get("step") || "1", 10) || 1),
  );
  const successIdParam = searchParams.get("id");

  const clients = useMemo(() => getClients(), []);
  const [draft, setDraft] = useState<Draft>({
    title: "",
    description: "",
    descriptionHash: "",
    ipfsRef: "",
    actions: [],
  });
  const [hydrated, setHydrated] = useState(false);
  const [isHashing, setIsHashing] = useState(false);

  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [votes, setVotes] = useState<bigint | null>(null);
  const [threshold, setThreshold] = useState<bigint | null>(null);
  const [estimate, setEstimate] = useState<{
    cpuInsns?: string;
    memBytes?: string;
  } | null>(null);
  const [estimateErr, setEstimateErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft(draft);
  }, [draft, hydrated]);

  // Auto-hash description when it changes
  useEffect(() => {
    if (!draft.description.trim()) return;

    const timer = setTimeout(async () => {
      setIsHashing(true);
      try {
        const hash = await hashDescription(draft.description);
        setDraft(d => ({ ...d, descriptionHash: hash }));
      } catch (err) {
        console.error("Hashing failed:", err);
      } finally {
        setIsHashing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [draft.description]);

  useEffect(() => {
    if (step === 4 && !successIdParam) {
      router.replace("/propose?step=3");
    }
  }, [step, successIdParam, router]);

  const setStep = useCallback(
    (n: number) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("step", String(n));
      if (n !== 4) q.delete("id");
      router.push(`/propose?${q.toString()}`);
    },
    [router, searchParams],
  );

  function validateStep1(): string[] {
    const err: string[] = [];
    const t = draft.title.trim();
    if (t.length < TITLE_MIN || t.length > TITLE_MAX) {
      err.push(`Title must be ${TITLE_MIN}–${TITLE_MAX} characters.`);
    }
    if (draft.description.trim().length < DESC_MIN) {
      err.push(`Description must be at least ${DESC_MIN} characters.`);
    }
    if (!isReasonableIpfsRef(draft.ipfsRef)) {
      err.push(
        "IPFS reference must be a gateway URL, ipfs:// link, or raw CID.",
      );
    }
    if (!draft.descriptionHash && draft.description.trim()) {
      err.push("Waiting for description hash computation...");
    }
    return err;
  }

  function validateStep2(): string[] {
    const err: string[] = [];
    for (const a of draft.actions) {
      if (!a.target.trim() || !a.fnName.trim()) {
        err.push("Each action needs a target and function name.");
        break;
      }
      const hasArgs = a.args.some((r) => r.value.trim() !== "");
      if (hasArgs && a.simulateOk !== true) {
        err.push("Simulate every action that has arguments before continuing.");
        break;
      }
    }
    return err;
  }

  function goNext() {
    setStepErrors([]);
    if (step === 1) {
      const e = validateStep1();
      if (e.length) {
        setStepErrors(e);
        return;
      }
    }
    if (step === 2) {
      const e = validateStep2();
      if (e.length) {
        setStepErrors(e);
        return;
      }
    }
    if (step === 3) {
      if (!isConnected || !publicKey) {
        setStepErrors(["Connect your wallet to submit."]);
        return;
      }
      if (votes === null || threshold === null) {
        setStepErrors(["Still loading voting power. Try again in a moment."]);
        return;
      }
      if (votes < threshold) {
        setStepErrors([
          `Voting power is below the proposal threshold (${threshold.toString()} required).`,
        ]);
        return;
      }
      void submitProposal();
      return;
    }
    setStep(step + 1);
  }

  async function submitProposal() {
    if (!clients || !publicKey) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const description = buildDescription(
        draft.title,
        draft.description,
        draft.ipfsRef,
      );
      const { targets, fnNames, calldatas } = buildPayload(
        draft.actions,
        clients.governorAddress,
      );
      const id = await clients.governor.proposeWithSign(
        publicKey,
        description,
        draft.descriptionHash,
        draft.ipfsRef, // Metadata URI
        targets,
        fnNames,
        calldatas,
        signTransaction,
      );
      sessionStorage.removeItem(STORAGE_KEY);
      setDraft({ title: "", description: "", descriptionHash: "", ipfsRef: "", actions: [] });
      router.push(`/propose?step=4&id=${id.toString()}`);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function runReviewLoads() {
    if (!clients || !publicKey) return;
    setEstimate(null);
    setEstimateErr(null);
    const [v, t] = await Promise.all([
      clients.votes.getVotes(publicKey),
      clients.governor.proposalThreshold(),
    ]);
    setVotes(v);
    setThreshold(t);

    const description = buildDescription(
      draft.title,
      draft.description,
      draft.ipfsRef,
    );
    const { targets, fnNames, calldatas } = buildPayload(
      draft.actions,
      clients.governorAddress,
    );
    const est = await clients.governor.estimateProposeResources(
      publicKey,
      description,
      draft.descriptionHash,
      draft.ipfsRef,
      targets,
      fnNames,
      calldatas,
    );
    if (!est.ok) {
      setEstimateErr(est.error ?? "Could not estimate proposal cost.");
      return;
    }
    setEstimate({ cpuInsns: est.cpuInsns, memBytes: est.memBytes });
  }

  useEffect(() => {
    if (step !== 3 || !clients || !publicKey) return;
    void runReviewLoads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    publicKey,
    clients?.governorAddress,
    draft.title,
    draft.description,
    draft.descriptionHash,
    draft.ipfsRef,
    draft.actions,
  ]);

  async function simulateAction(act: WizardAction) {
    if (!clients || !publicKey) return;
    setSimBusy(act.id);
    try {
      const args = act.args
        .filter((r) => r.value.trim())
        .map(calldataArgRowToScVal);
      const res = await clients.governor.simulateTargetInvocation(
        publicKey,
        act.target.trim(),
        act.fnName.trim(),
        args,
      );
      setDraft((d) => ({
        ...d,
        actions: d.actions.map((x) =>
          x.id === act.id
            ? {
              ...x,
              simulateOk: res.ok,
              simulateError: res.ok ? undefined : res.error,
            }
            : x,
        ),
      }));
    } catch (e: unknown) {
      setDraft((d) => ({
        ...d,
        actions: d.actions.map((x) =>
          x.id === act.id
            ? {
              ...x,
              simulateOk: false,
              simulateError:
                e instanceof Error ? e.message : "Simulation failed",
            }
            : x,
        ),
      }));
    } finally {
      setSimBusy(null);
    }
  }

  if (!clients) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          Set <span className="font-mono">NEXT_PUBLIC_GOVERNOR_ADDRESS</span>,{" "}
          <span className="font-mono">NEXT_PUBLIC_TIMELOCK_ADDRESS</span>, and{" "}
          <span className="font-mono">NEXT_PUBLIC_VOTES_ADDRESS</span> in{" "}
          <span className="font-mono">.env.local</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">New proposal</h1>
      <p className="text-gray-500 mb-8">
        Step-by-step flow with validation, previews, and on-chain simulation.
      </p>

      {/* Progress */}
      <ol className="flex items-center gap-2 mb-10 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold ${step >= s.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-500"
                }`}
            >
              {s.id}
            </span>
            <span
              className={`truncate hidden sm:inline ${step === s.id ? "font-semibold text-gray-900" : "text-gray-500"
                }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-gray-200 min-w-[12px] hidden md:block" />
            )}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title ({TITLE_MIN}–{TITLE_MAX} characters)
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="Short, specific title"
              maxLength={TITLE_MAX + 5}
            />
            <p className="text-xs text-gray-400 mt-1">
              {draft.title.trim().length} / {TITLE_MAX} (min {TITLE_MIN})
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Markdown, min {DESC_MIN} chars)
              </label>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                rows={12}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                placeholder="Full proposal narrative: context, options, risks…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                Preview
                {isHashing && (
                  <span className="text-[10px] text-indigo-600 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Hashing...
                  </span>
                )}
              </label>
              <div className="min-h-[18rem] border border-gray-200 rounded-lg p-3 bg-gray-50/80 text-sm text-gray-800 overflow-auto prose-p:my-2 prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-headings:font-semibold prose-a:text-indigo-600">
                {draft.description.trim() ? (
                  <ReactMarkdown>{draft.description}</ReactMarkdown>
                ) : (
                  <span className="text-gray-400">Nothing to preview yet.</span>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metadata Uri / IPFS Attachment
            </label>
            <input
              type="text"
              value={draft.ipfsRef}
              onChange={(e) =>
                setDraft((d) => ({ ...d, ipfsRef: e.target.value }))
              }
              placeholder="ipfs://… or https://…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Points to the full proposal metadata. The description above will be hashed and stored on-chain.
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Optional on-chain actions after the vote passes. Leave empty to submit a
            governance-only signal (uses a safe <span className="font-mono">proposal_count</span>{" "}
            placeholder on the governor).
          </p>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, actions: [...d.actions, newAction()] }))
            }
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            + Add action
          </button>

          <ul className="space-y-4">
            {draft.actions.map((act, idx) => (
              <li
                key={act.id}
                className="border border-gray-200 rounded-xl p-4 bg-white space-y-3"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    Action {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={idx === 0}
                      onClick={() =>
                        setDraft((d) => {
                          const a = [...d.actions];
                          [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
                          return { ...d, actions: a };
                        })
                      }
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={idx === draft.actions.length - 1}
                      onClick={() =>
                        setDraft((d) => {
                          const a = [...d.actions];
                          [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]];
                          return { ...d, actions: a };
                        })
                      }
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          actions: d.actions.filter((x) => x.id !== act.id),
                        }))
                      }
                      className="text-xs text-red-600 hover:text-red-800 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Target (C… / G…)</label>
                    <input
                      value={act.target}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({
                          ...d,
                          actions: d.actions.map((x) =>
                            x.id === act.id ? { ...x, target: v, simulateOk: null } : x,
                          ),
                        }));
                      }}
                      className="w-full mt-0.5 border rounded-lg px-2 py-1.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Function name</label>
                    <input
                      value={act.fnName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({
                          ...d,
                          actions: d.actions.map((x) =>
                            x.id === act.id ? { ...x, fnName: v, simulateOk: null } : x,
                          ),
                        }));
                      }}
                      className="w-full mt-0.5 border rounded-lg px-2 py-1.5 text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Arguments</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          actions: d.actions.map((x) =>
                            x.id === act.id
                              ? { ...x, args: [...x.args, newArgRow()], simulateOk: null }
                              : x,
                          ),
                        }))
                      }
                      className="text-xs text-indigo-600"
                    >
                      + Arg
                    </button>
                  </div>
                  {act.args.map((row) => (
                    <div key={row.id} className="flex flex-wrap gap-2 mb-2">
                      <select
                        value={row.kind}
                        onChange={(e) => {
                          const kind = e.target.value as CalldataArgRow["kind"];
                          setDraft((d) => ({
                            ...d,
                            actions: d.actions.map((x) =>
                              x.id === act.id
                                ? {
                                  ...x,
                                  args: x.args.map((r) =>
                                    r.id === row.id ? { ...r, kind } : r,
                                  ),
                                  simulateOk: null,
                                }
                                : x,
                            ),
                          }));
                        }}
                        className="bg-gray-50 border rounded text-xs px-1 py-1"
                      >
                        <option value="address">Address</option>
                        <option value="string">String</option>
                        <option value="u64">u64</option>
                        <option value="i128">i128</option>
                        <option value="bool">Bool</option>
                      </select>
                      <input
                        value={row.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            actions: d.actions.map((x) =>
                              x.id === act.id
                                ? {
                                  ...x,
                                  args: x.args.map((r) =>
                                    r.id === row.id ? { ...r, value: v } : r,
                                  ),
                                  simulateOk: null,
                                }
                                : x,
                            ),
                          }));
                        }}
                        placeholder="Value"
                        className="flex-1 min-w-[120px] border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            actions: d.actions.map((x) =>
                              x.id === act.id
                                ? {
                                  ...x,
                                  args: x.args.filter((r) => r.id !== row.id),
                                  simulateOk: null,
                                }
                                : x,
                            ),
                          }))
                        }
                        className="text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!act.target.trim() || !act.fnName.trim() || simBusy === act.id}
                    onClick={() => simulateAction(act)}
                    className="text-xs bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    {simBusy === act.id ? "Simulating..." : "Simulate action"}
                  </button>
                  {act.simulateOk === true && (
                    <span className="text-xs text-green-600 font-medium">✓ Ready</span>
                  )}
                  {act.simulateOk === false && (
                    <span className="text-xs text-red-600 font-medium">
                      {act.simulateError ? `Error: ${act.simulateError}` : "Simulation failed"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Review Content
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase mb-1">Title</p>
                <p className="text-lg font-bold text-gray-900">{draft.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase mb-1">Description Hash (SHA-256)</p>
                <p className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
                  {draft.descriptionHash || "Computing..."}
                </p>
              </div>
              <div className="prose prose-sm max-w-none text-gray-800 bg-gray-50 p-4 rounded-xl">
                <ReactMarkdown>{draft.description}</ReactMarkdown>
              </div>
              {draft.ipfsRef && (
                <div className="flex items-center gap-2 text-xs text-indigo-600">
                  <LinkIcon className="w-3 h-3" />
                  <span className="font-medium">Metadata URI:</span>
                  <span className="font-mono">{draft.ipfsRef}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              On-chain actions
            </h2>
            {draft.actions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No on-chain actions (signal only).</p>
            ) : (
              <ul className="space-y-4">
                {draft.actions.map((act, i) => (
                  <li key={i} className="text-sm font-mono bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="text-indigo-600 mb-1">{act.target}</div>
                    <div className="text-gray-900">{act.fnName}({act.args.map(a => a.value).join(', ')})</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-6">
              Submission check
            </h2>
            <div className="space-y-6">
              {!isConnected ? (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-4 rounded-xl text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  Please connect your wallet to verify permissions.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase mb-1">Your Votes</p>
                    <p className="text-xl font-bold text-gray-900">
                      {votes === null ? "..." : (Number(votes) / 10 ** 7).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase mb-1">Threshold</p>
                    <p className="text-xl font-bold text-gray-900">
                      {threshold === null ? "..." : (Number(threshold) / 10 ** 7).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {estimate && (
                <div className="border-t border-gray-100 pt-6">
                  <p className="text-xs text-gray-400 font-medium uppercase mb-3">Resource Estimate</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500 mr-2">CPU:</span>
                      <span className="font-mono font-medium">{Number(estimate.cpuInsns).toLocaleString()} cycles</span>
                    </div>
                    <div>
                      <span className="text-gray-500 mr-2">RAM:</span>
                      <span className="font-mono font-medium">{(Number(estimate.memBytes) / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </div>
              )}

              {estimateErr && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                  Simulation Warning: {estimateErr}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <Share2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Proposal submitted!</h2>
          <p className="text-gray-500 mb-8 max-w-sm">
            Your proposal is now pending. It will become active after the voting delay.
          </p>
          <div className="flex gap-4">
            <Link
              href={`/proposal/${successIdParam}`}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              View Proposal
            </Link>
            <button
              onClick={() => router.push("/")}
              className="text-gray-600 px-6 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              Back to list
            </button>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      {step < 4 && (
        <div className="mt-12 flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            onClick={() => step > 1 && setStep(step - 1)}
            disabled={step === 1 || submitting}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30"
          >
            Back
          </button>

          <div className="flex items-center gap-3">
            {stepErrors.length > 0 && (
              <span className="text-xs text-red-600 font-medium">
                {stepErrors[0]}
              </span>
            )}
            <button
              onClick={goNext}
              disabled={submitting || (step === 3 && !reviewDataReady)}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-w-[120px]"
            >
              {submitting ? "Submitting..." : step === 3 ? "Submit Proposal" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {submitError}
        </div>
      )}
    </div>
  );
}

export default function ProposeWizard() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading wizard...</div>}>
      <ProposeWizardInner />
    </Suspense>
  );
}
