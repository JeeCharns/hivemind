// types/decision-space.ts

/**
 * Decision Space Types
 *
 * Types for decision sessions with versioned voting rounds
 */

// ============================================
// ENUMS / UNIONS
// ============================================

export type DecisionRoundStatus = 'voting_open' | 'voting_closed' | 'results_generated';

export type DecisionVisibility = 'hidden' | 'aggregate' | 'transparent';

// ============================================
// DATABASE ROWS
// ============================================

export interface DecisionProposalRow {
  id: string;
  conversation_id: string;
  source_bucket_id: string | null;
  source_cluster_index: number;
  statement_text: string;
  original_agree_percent: number | null;
  display_order: number;
  created_at: string;
}

export interface DecisionRoundRow {
  id: string;
  conversation_id: string;
  round_number: number;
  status: DecisionRoundStatus;
  visibility: DecisionVisibility;
  deadline: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface DecisionVoteRow {
  id: string;
  round_id: string;
  user_id: string;
  proposal_id: string;
  votes: number;
  created_at: string;
  updated_at: string;
}

export interface DecisionResultRow {
  id: string;
  round_id: string;
  proposal_rankings: ProposalRanking[];
  ai_analysis: string | null;
  generated_at: string;
}

// ============================================
// VIEW MODELS
// ============================================

export interface ProposalRanking {
  proposalId: string;
  statementText: string;
  totalVotes: number;
  votePercent: number;
  rank: number;
  changeFromPrevious?: number; // positive = moved up, negative = moved down
}

export interface DecisionProposalViewModel {
  id: string;
  statementText: string;
  sourceClusterIndex: number;
  originalAgreePercent: number | null;
  displayOrder: number;
  // Populated at runtime based on visibility
  totalVotes?: number;
  userVotes?: number;
}

export interface DecisionRoundViewModel {
  id: string;
  roundNumber: number;
  status: DecisionRoundStatus;
  visibility: DecisionVisibility;
  deadline: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface DecisionResultViewModel {
  roundId: string;
  roundNumber: number;
  proposalRankings: ProposalRanking[];
  aiAnalysis: string | null;
  generatedAt: string;
}

// ============================================
// API INPUTS
// ============================================

export interface CreateDecisionSessionInput {
  hiveId: string;
  sourceConversationId: string;
  title: string;
  description?: string;
  selectedClusters: number[];
  selectedStatements: SelectedStatement[];
  consensusThreshold: number; // 50-90
  visibility: DecisionVisibility;
  deadline?: string; // ISO date
}

export interface SelectedStatement {
  bucketId: string;
  clusterIndex: number;
  statementText: string;
  agreePercent: number | null;
}

export interface VoteOnProposalInput {
  roundId: string;
  proposalId: string;
  delta: number; // +1 or -1
}

export interface VoteOnProposalResult {
  success: boolean;
  newVotes?: number;
  remainingCredits?: number;
  errorCode?: string;
}

export interface CloseRoundInput {
  roundId: string;
}

export interface StartNewRoundInput {
  conversationId: string;
  keepProposals: boolean;
  // If keepProposals is false, these are required:
  selectedStatements?: SelectedStatement[];
}

// ============================================
// SETUP WIZARD STATE
// ============================================

export interface ClusterSelectionItem {
  clusterIndex: number;
  name: string;
  description: string;
  statementCount: number;
  avgConsensusPercent: number;
  selected: boolean;
}

export interface StatementSelectionItem {
  bucketId: string;
  clusterIndex: number;
  clusterName: string;
  statementText: string;
  agreePercent: number | null;
  totalVotes: number;
  selected: boolean;
  recommended: boolean; // above threshold
}

export interface DecisionSetupState {
  step: 1 | 2 | 3 | 4;
  sourceConversationId: string | null;
  selectedClusters: number[];
  selectedStatements: SelectedStatement[];
  consensusThreshold: number;
  title: string;
  description: string;
  visibility: DecisionVisibility;
  deadline: string | null;
}
