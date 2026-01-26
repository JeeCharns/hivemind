// lib/decision-space/react/useDecisionSetupWizard.ts

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  ClusterSelectionItem,
  StatementSelectionItem,
  DecisionVisibility,
  SelectedStatement,
} from "@/types/decision-space";

/** Default consensus threshold percentage for statement recommendations */
const DEFAULT_CONSENSUS_THRESHOLD = 70;

export interface UseDecisionSetupWizardProps {
  hiveId: string;
  hiveSlug?: string | null;
  open: boolean;
  initialTitle?: string;
  initialDescription?: string;
}

export interface UseDecisionSetupWizardReturn {
  // Navigation
  step: 1 | 2 | 3 | 4 | 5;
  loading: boolean;
  sourcesLoading: boolean;
  error: string | null;

  // Step 1: Source selection
  sourceConversations: { id: string; title: string; statementCount: number; votingCoverage: number; date: string }[];
  selectedSourceId: string | null;
  setSelectedSourceId: (id: string | null) => void;

  // Step 2: Cluster selection
  clusters: ClusterSelectionItem[];
  toggleCluster: (index: number) => void;
  selectAllClusters: () => void;
  deselectAllClusters: () => void;

  // Step 3: Statement selection
  statements: StatementSelectionItem[];
  consensusThreshold: number;
  setConsensusThreshold: (value: number) => void;
  toggleStatement: (bucketId: string) => void;
  selectAllInCluster: (clusterIndex: number) => void;

  // Step 4: Settings
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  visibility: DecisionVisibility;
  setVisibility: (value: DecisionVisibility) => void;
  deadline: string;
  setDeadline: (value: string) => void;

  // Actions
  onNext: () => Promise<void>;
  onBack: () => void;
  onFinish: () => Promise<void>;
}

export function useDecisionSetupWizard({
  hiveId,
  hiveSlug,
  open,
  initialTitle = "",
  initialDescription = "",
}: UseDecisionSetupWizardProps): UseDecisionSetupWizardReturn {
  const router = useRouter();

  // Navigation state
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Source selection
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceConversations, setSourceConversations] = useState<
    { id: string; title: string; statementCount: number; votingCoverage: number; date: string }[]
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Step 2: Cluster selection
  const [clusters, setClusters] = useState<ClusterSelectionItem[]>([]);

  // Step 3: Statement selection
  const [statements, setStatements] = useState<StatementSelectionItem[]>([]);
  const [consensusThreshold, setConsensusThreshold] = useState(DEFAULT_CONSENSUS_THRESHOLD);

  // Step 4: Settings
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<DecisionVisibility>("hidden");
  const [deadline, setDeadline] = useState("");

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError(null);
    setSelectedSourceId(null);
    setClusters([]);
    setStatements([]);
    setConsensusThreshold(DEFAULT_CONSENSUS_THRESHOLD);
    setTitle(initialTitle);
    setDescription(initialDescription);
    setVisibility("hidden");
    setDeadline("");
  }, [open, initialTitle, initialDescription]);

  // Fetch source conversations on mount
  useEffect(() => {
    if (!open || !hiveId) return;

    let cancelled = false;
    setSourcesLoading(true);

    fetch(`/api/hives/${hiveId}/understand-sessions?status=ready`)
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSourceConversations(data.sessions || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useDecisionSetupWizard] Failed to fetch sources:", err);
        setError("Failed to load understand sessions");
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, hiveId]);

  // Fetch setup data when source is selected
  useEffect(() => {
    if (!selectedSourceId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/decision-space/setup?sourceConversationId=${selectedSourceId}`)
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setClusters(data.clusters || []);
        // Apply initial threshold-based recommendations when statements are fetched
        const fetchedStatements = data.statements || [];
        setStatements(
          fetchedStatements.map((s: StatementSelectionItem) => ({
            ...s,
            recommended: s.agreePercent !== null && s.agreePercent >= DEFAULT_CONSENSUS_THRESHOLD,
            selected: s.agreePercent !== null && s.agreePercent >= DEFAULT_CONSENSUS_THRESHOLD,
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useDecisionSetupWizard] Failed to fetch setup data:", err);
        setError("Failed to load clusters and statements");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSourceId]);

  // Update statement recommendations when threshold changes
  useEffect(() => {
    setStatements((prev) =>
      prev.map((s) => ({
        ...s,
        recommended: s.agreePercent !== null && s.agreePercent >= consensusThreshold,
        selected: s.selected || (s.agreePercent !== null && s.agreePercent >= consensusThreshold),
      }))
    );
  }, [consensusThreshold]);

  // Cluster actions
  const toggleCluster = useCallback((index: number) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.clusterIndex === index ? { ...c, selected: !c.selected } : c
      )
    );
  }, []);

  const selectAllClusters = useCallback(() => {
    setClusters((prev) => prev.map((c) => ({ ...c, selected: true })));
  }, []);

  const deselectAllClusters = useCallback(() => {
    setClusters((prev) => prev.map((c) => ({ ...c, selected: false })));
  }, []);

  // Statement actions
  const toggleStatement = useCallback((bucketId: string) => {
    setStatements((prev) =>
      prev.map((s) =>
        s.bucketId === bucketId ? { ...s, selected: !s.selected } : s
      )
    );
  }, []);

  const selectAllInCluster = useCallback((clusterIndex: number) => {
    setStatements((prev) =>
      prev.map((s) =>
        s.clusterIndex === clusterIndex ? { ...s, selected: true } : s
      )
    );
  }, []);

  // Navigation
  const onNext = useCallback(async () => {
    setError(null);

    if (step === 1) {
      if (!selectedSourceId) {
        setError("Select an understand session to continue");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const selectedCount = clusters.filter((c) => c.selected).length;
      if (selectedCount === 0) {
        setError("Select at least one cluster");
        return;
      }
      // Filter statements to only show from selected clusters
      const selectedClusterIndices = new Set(
        clusters.filter((c) => c.selected).map((c) => c.clusterIndex)
      );
      setStatements((prev) =>
        prev.map((s) => ({
          ...s,
          selected: selectedClusterIndices.has(s.clusterIndex)
            ? s.recommended
            : false,
        }))
      );
      setStep(3);
    } else if (step === 3) {
      const selectedCount = statements.filter((s) => s.selected).length;
      if (selectedCount === 0) {
        setError("Select at least one statement");
        return;
      }
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    }
  }, [step, selectedSourceId, clusters, statements]);

  const onBack = useCallback(() => {
    setError(null);
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
    }
  }, [step]);

  const onFinish = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    const selectedStatements: SelectedStatement[] = statements
      .filter((s) => s.selected)
      .map((s) => ({
        bucketId: s.bucketId,
        clusterIndex: s.clusterIndex,
        statementText: s.statementText,
        agreePercent: s.agreePercent,
      }));

    try {
      const response = await fetch("/api/decision-space", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hiveId,
          sourceConversationId: selectedSourceId,
          title: title.trim(),
          description: description.trim() || undefined,
          selectedClusters: clusters
            .filter((c) => c.selected)
            .map((c) => c.clusterIndex),
          selectedStatements,
          consensusThreshold,
          visibility,
          deadline: deadline || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const result = await response.json();
      const hiveKey = hiveSlug || hiveId;
      router.push(`/hives/${hiveKey}/conversations/${result.conversationId}/decide`);
    } catch (err) {
      console.error("[useDecisionSetupWizard] Failed to finish:", err);
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [
    title,
    description,
    hiveId,
    hiveSlug,
    selectedSourceId,
    clusters,
    statements,
    consensusThreshold,
    visibility,
    deadline,
    router,
  ]);

  return {
    step,
    loading,
    sourcesLoading,
    error,
    sourceConversations,
    selectedSourceId,
    setSelectedSourceId,
    clusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    statements,
    consensusThreshold,
    setConsensusThreshold,
    toggleStatement,
    selectAllInCluster,
    title,
    setTitle,
    description,
    setDescription,
    visibility,
    setVisibility,
    deadline,
    setDeadline,
    onNext,
    onBack,
    onFinish,
  };
}
