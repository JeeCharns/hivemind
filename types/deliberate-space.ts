/**
 * Deliberate Space Types
 *
 * Types for deliberate conversations with 5-point sentiment voting
 */

// VOTE LABELS
export const VOTE_LABELS = {
  5: "Deeply resonates",
  4: "Mostly resonates",
  3: "Mixed reaction",
  2: "It's complicated",
  1: "Strong aversion",
} as const;

export type VoteValue = 1 | 2 | 3 | 4 | 5;

// STATEMENT TYPES
export interface DeliberateStatement {
  id: string;
  clusterIndex: number | null;
  clusterName: string | null;
  /** Short title for the statement (from source bucket name if available) */
  statementTitle: string | null;
  statementText: string;
  sourceBucketId: string | null;
  /** Source conversation ID (for fetching original responses) */
  sourceConversationId: string | null;
  /** Number of original responses in the source bucket */
  originalResponseCount: number;
  displayOrder: number;
  voteCount: number;
  averageVote: number | null;
  commentCount: number;
}

export interface ManualStatement {
  text: string;
  clusterName?: string;
}

// VIEW MODEL
export interface DeliberateViewModel {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  statements: DeliberateStatement[];
  userVotes: Record<string, VoteValue | null>;
  /** Statement IDs the user has passed on */
  userPasses: string[];
  clusters: DeliberateCluster[];
}

export interface DeliberateCluster {
  index: number | null;
  name: string | null;
  statementCount: number;
}

// COMMENT TYPES
export interface DeliberateComment {
  id: string;
  statementId: string;
  text: string;
  isAnonymous: boolean;
  createdAt: string;
  user: {
    id: string | null;
    name: string;
    avatarUrl: string | null;
  };
  /** The vote value the commenter gave to this statement (null if passed or no vote) */
  userVote: VoteValue | null;
  isMine: boolean;
}

// WIZARD STATE
export type DeliberateWizardMode = "from-understand" | "from-scratch";

export interface ClusterSelectionItem {
  clusterIndex: number;
  name: string;
  description: string;
  statementCount: number;
  selected: boolean;
}

export interface StatementSelectionItem {
  bucketId: string;
  clusterIndex: number;
  clusterName: string;
  statementText: string;
  selected: boolean;
}

// API TYPES
export interface CreateDeliberateSessionInput {
  hiveId: string;
  mode: DeliberateWizardMode;
  title: string;
  description?: string;
  sourceConversationId?: string;
  selectedStatements?: StatementSelectionItem[];
  manualStatements?: ManualStatement[];
}

export interface CreateDeliberateSessionResult {
  conversationId: string;
  slug: string | null;
}

export interface VoteOnStatementInput {
  statementId: string;
  voteValue: VoteValue | null;
}

export interface AddCommentInput {
  statementId: string;
  text: string;
  isAnonymous?: boolean;
}
