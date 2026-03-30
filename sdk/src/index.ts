/**
 * @nebgov/sdk — TypeScript SDK for the NebGov governance framework on Stellar.
 *
 * @example
 * import { GovernorClient, VotesClient, ProposalState, VoteSupport } from "@nebgov/sdk";
 *
 * const client = new GovernorClient({
 *   governorAddress: "CABC...",
 *   timelockAddress: "CDEF...",
 *   votesAddress: "CGHI...",
 *   network: "testnet",
 * });
 */

export { GovernorClient } from "./governor";
export { VotesClient } from "./votes";
export { TimelockClient } from "./timelock";
export { WrapperClient } from "./wrapper";
export type { WrapperConfig } from "./wrapper";
export {
  subscribeToProposals,
  subscribeToVotes,
  getProposalEvents,
  subscribeToProposalQueued,
  subscribeToProposalExecuted,
  subscribeToProposalCancelled,
  subscribeToProposalExpired,
  subscribeToGovernorUpgraded,
  subscribeToConfigUpdated,
} from "./events";
export type {
  SorobanEvent,
  SubscriptionOptions,
  ProposalCreatedEventData,
  VoteCastEventData,
  ProposalQueuedEventData,
  ProposalExecutedEventData,
  ProposalCancelledEventData,
  ProposalExpiredEventData,
  GovernorUpgradedEventData,
  ConfigUpdatedEventData,
} from "./events";
export {
  parseProposalCreatedEvent,
  parseVoteCastEvent,
  parseProposalQueuedEvent,
  parseProposalExecutedEvent,
  parseProposalCancelledEvent,
  parseProposalExpiredEvent,
  parseGovernorUpgradedEvent,
  parseConfigUpdatedEvent,
} from "./events";
export * from "./types";
