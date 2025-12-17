/**
 * Conversation Voting Types
 *
 * Types for quadratic voting in decision sessions
 */

/**
 * A single vote allocation by a user on a proposal
 */
export type ProposalVote = {
  conversationId: string;
  responseId: string;
  userId: string;
  votes: number;
  updatedAt: string;
};

/**
 * Vote summary for a user in a conversation
 */
export type UserVoteSummary = {
  totalCreditsSpent: number;
  remainingCredits: number;
  votes: Record<string, number>; // responseId -> vote count
};

/**
 * Proposal with aggregated vote totals
 */
export type ProposalWithVotes = {
  responseId: string;
  text: string;
  authorId: string | null;
  anonymous: boolean;
  createdAt: string;
  totalVotes: number;
  userVote: number; // Current user's vote on this proposal
};

/**
 * Vote action result
 */
export type VoteResult = {
  success: boolean;
  newVotes: number;
  remainingCredits: number;
  errorCode?: string;
};
