// lib/deliberate-space/react/useDeliberateSetupWizard.ts

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/** Manual statement input by user */
export interface ManualStatement {
  id: string; // Temporary client-side ID
  text: string;
  clusterName?: string;
}

/** Statement from an understand conversation */
export interface SourceStatement {
  bucketId: string;
  clusterIndex: number;
  clusterName: string;
  statementText: string;
  selected: boolean;
}

/** Cluster from an understand conversation */
export interface SourceCluster {
  clusterIndex: number;
  name: string;
  description: string;
  statementCount: number;
  selected: boolean;
}

/** Source conversation summary */
export interface SourceConversation {
  id: string;
  title: string;
  description: string;
  type: "understand" | "explore";
  statementCount: number;
  clusterCount: number;
  date: string;
}

export type DeliberateMode = "from-understand" | "from-scratch";

export interface UseDeliberateSetupWizardProps {
  hiveId: string;
  hiveSlug?: string | null;
  open: boolean;
}

export interface UseDeliberateSetupWizardReturn {
  // Mode selection
  mode: DeliberateMode | null;
  setMode: (mode: DeliberateMode) => void;

  // Navigation
  step: number;
  totalSteps: number;
  loading: boolean;
  sourcesLoading: boolean;
  error: string | null;

  // From-understand: Source selection
  sourceConversations: SourceConversation[];
  selectedSourceId: string | null;
  setSelectedSourceId: (id: string | null) => void;

  // From-understand: Cluster selection
  clusters: SourceCluster[];
  toggleCluster: (index: number) => void;
  selectAllClusters: () => void;
  deselectAllClusters: () => void;

  // From-understand: Statement selection
  statements: SourceStatement[];
  toggleStatement: (bucketId: string) => void;
  selectAllInCluster: (clusterIndex: number) => void;

  // From-scratch: Manual statements
  manualStatements: ManualStatement[];
  addManualStatement: (text: string, clusterName?: string) => void;
  updateManualStatement: (
    id: string,
    text: string,
    clusterName?: string
  ) => void;
  removeManualStatement: (id: string) => void;

  // Settings
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;

  // Actions
  onNext: () => Promise<void>;
  onBack: () => void;
  onFinish: () => Promise<void>;
}

/**
 * Hook for managing deliberate session setup wizard state
 *
 * Supports two modes:
 * - from-understand: Select statements from an existing understand conversation
 * - from-scratch: Add statements manually
 */
export function useDeliberateSetupWizard({
  hiveId,
  hiveSlug,
  open,
}: UseDeliberateSetupWizardProps): UseDeliberateSetupWizardReturn {
  const router = useRouter();

  // Mode selection
  const [mode, setMode] = useState<DeliberateMode | null>(null);

  // Navigation state
  const [step, setStep] = useState(0); // 0 = mode selection
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 (from-understand): Source selection
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceConversations, setSourceConversations] = useState<
    SourceConversation[]
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Step 2 (from-understand): Cluster selection
  const [clusters, setClusters] = useState<SourceCluster[]>([]);

  // Step 3 (from-understand): Statement selection
  const [statements, setStatements] = useState<SourceStatement[]>([]);

  // From-scratch: Manual statements
  const [manualStatements, setManualStatements] = useState<ManualStatement[]>(
    []
  );

  // Settings
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Calculate total steps based on mode
  const totalSteps = mode === "from-understand" ? 5 : 3;

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMode(null);
    setStep(0);
    setError(null);
    setSelectedSourceId(null);
    setClusters([]);
    setStatements([]);
    setManualStatements([]);
    setTitle("");
    setDescription("");
  }, [open]);

  // Fetch source conversations when mode is selected as from-understand
  useEffect(() => {
    if (!open || mode !== "from-understand" || step !== 1) return;

    let cancelled = false;
    setSourcesLoading(true);
    setError(null);

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
        // Map to SourceConversation shape
        const sessions = (data.sessions || []).map(
          (s: {
            id: string;
            title?: string;
            description?: string;
            type?: string;
            statementCount?: number;
            clusterCount?: number;
            date?: string;
          }) => ({
            id: s.id,
            title: s.title || "Untitled Session",
            description: s.description || "",
            type: (s.type as "understand" | "explore") || "understand",
            statementCount: s.statementCount || 0,
            clusterCount: s.clusterCount || 0,
            date: s.date || "",
          })
        );
        setSourceConversations(sessions);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          "[useDeliberateSetupWizard] Failed to fetch sources:",
          err
        );
        setError("Failed to load sessions");
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, step, hiveId]);

  // Fetch setup data when source is selected
  useEffect(() => {
    if (!selectedSourceId || mode !== "from-understand") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/deliberate-space/setup?sourceConversationId=${selectedSourceId}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // Map clusters with selected = true by default
        setClusters(
          (data.clusters || []).map(
            (c: {
              clusterIndex: number;
              name: string;
              description?: string;
              statementCount?: number;
            }) => ({
              ...c,
              description: c.description || "",
              statementCount: c.statementCount || 0,
              selected: true,
            })
          )
        );
        // Map statements with selected = true by default
        setStatements(
          (data.statements || []).map(
            (s: {
              bucketId: string;
              clusterIndex: number;
              clusterName: string;
              statementText: string;
            }) => ({
              ...s,
              selected: true,
            })
          )
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          "[useDeliberateSetupWizard] Failed to fetch setup data:",
          err
        );
        setError("Failed to load clusters and statements");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSourceId, mode]);

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

  // Manual statement actions
  const addManualStatement = useCallback(
    (text: string, clusterName?: string) => {
      const newStatement: ManualStatement = {
        id: crypto.randomUUID(),
        text,
        clusterName,
      };
      setManualStatements((prev) => [...prev, newStatement]);
    },
    []
  );

  const updateManualStatement = useCallback(
    (id: string, text: string, clusterName?: string) => {
      setManualStatements((prev) =>
        prev.map((s) => (s.id === id ? { ...s, text, clusterName } : s))
      );
    },
    []
  );

  const removeManualStatement = useCallback((id: string) => {
    setManualStatements((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Navigation
  const onNext = useCallback(async () => {
    setError(null);

    // Mode selection -> first step
    if (step === 0 && mode) {
      setStep(1);
      return;
    }

    if (mode === "from-understand") {
      if (step === 1) {
        // Source selection -> Cluster selection
        if (!selectedSourceId) {
          setError("Select a session to continue");
          return;
        }
        setStep(2);
      } else if (step === 2) {
        // Cluster selection -> Statement selection
        const selectedCount = clusters.filter((c) => c.selected).length;
        if (selectedCount === 0) {
          setError("Select at least one cluster");
          return;
        }
        // Filter out statements from non-selected clusters
        const selectedClusterIndices = new Set(
          clusters.filter((c) => c.selected).map((c) => c.clusterIndex)
        );
        setStatements((prev) =>
          prev.map((s) => ({
            ...s,
            selected: selectedClusterIndices.has(s.clusterIndex)
              ? s.selected
              : false,
          }))
        );
        setStep(3);
      } else if (step === 3) {
        // Statement selection -> Settings
        const selectedCount = statements.filter((s) => s.selected).length;
        if (selectedCount === 0) {
          setError("Select at least one statement");
          return;
        }
        // Pre-fill title and description from source conversation
        const sourceConv = sourceConversations.find(
          (c) => c.id === selectedSourceId
        );
        if (sourceConv && !title) {
          setTitle(sourceConv.title);
        }
        if (sourceConv && !description) {
          setDescription(sourceConv.description);
        }
        setStep(4);
      } else if (step === 4) {
        // Settings -> Review
        if (!title.trim()) {
          setError("Title is required");
          return;
        }
        setStep(5);
      }
    } else if (mode === "from-scratch") {
      if (step === 1) {
        // Manual statements -> Settings
        if (manualStatements.length === 0) {
          setError("Add at least one statement");
          return;
        }
        setStep(2);
      } else if (step === 2) {
        // Settings -> Review
        if (!title.trim()) {
          setError("Title is required");
          return;
        }
        setStep(3);
      }
    }
  }, [
    step,
    mode,
    selectedSourceId,
    clusters,
    statements,
    manualStatements,
    title,
  ]);

  const onBack = useCallback(() => {
    setError(null);
    if (step > 0) {
      if (step === 1) {
        // Back to mode selection
        setMode(null);
        setStep(0);
      } else {
        setStep((prev) => prev - 1);
      }
    }
  }, [step]);

  const onFinish = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        hiveId,
        mode,
        title: title.trim(),
        description: description.trim() || undefined,
      };

      if (mode === "from-understand") {
        body.sourceConversationId = selectedSourceId;
        body.selectedStatements = statements
          .filter((s) => s.selected)
          .map((s) => ({
            bucketId: s.bucketId,
            clusterIndex: s.clusterIndex,
            clusterName: s.clusterName,
            statementText: s.statementText,
          }));
      } else if (mode === "from-scratch") {
        body.manualStatements = manualStatements.map((s) => ({
          text: s.text,
          clusterName: s.clusterName,
        }));
      }

      const response = await fetch("/api/deliberate-space", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const result = await response.json();
      const hiveKey = hiveSlug || hiveId;
      router.push(
        `/hives/${hiveKey}/conversations/${result.conversationId}/discuss`
      );
    } catch (err) {
      console.error("[useDeliberateSetupWizard] Failed to finish:", err);
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [
    title,
    description,
    hiveId,
    hiveSlug,
    mode,
    selectedSourceId,
    statements,
    manualStatements,
    router,
  ]);

  return {
    mode,
    setMode,
    step,
    totalSteps,
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
    toggleStatement,
    selectAllInCluster,
    manualStatements,
    addManualStatement,
    updateManualStatement,
    removeManualStatement,
    title,
    setTitle,
    description,
    setDescription,
    onNext,
    onBack,
    onFinish,
  };
}
