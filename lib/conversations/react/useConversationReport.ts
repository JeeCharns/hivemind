/**
 * useConversationReport Hook - Report Management
 *
 * Manages report viewing, version selection, and generation
 * Follows DIP: accepts client injection for testing
 */

import { useState, useCallback, useMemo } from "react";
import type {
  AgreementSummary,
  ConsensusItem,
  ResultViewModel,
  ReportVersion,
} from "@/types/conversation-report";
import {
  reportClient as defaultReportClient,
  type IConversationReportClient,
} from "../data/reportClient";
import { reportContentToHtml, downloadHtmlBlob } from "../domain/reportHtml";

export interface UseConversationReportOptions {
  viewModel: ResultViewModel;
  reportClient?: IConversationReportClient;
}

export interface UseConversationReportReturn {
  currentHtml: string;
  selectedVersion: number | null;
  versions: ReportVersion[];
  agreementSummaries: AgreementSummary[];
  consensusItems: ConsensusItem[];
  totalInteractions: number;
  loading: boolean;
  error: string | null;
  generate: () => Promise<void>;
  download: () => void;
  selectVersion: (version: number) => void;
}

/**
 * Hook for managing conversation report with version selection
 *
 * Features:
 * - Version selection and display
 * - Report generation with loading state
 * - Download HTML file
 * - Dependency injection for testing
 */
export function useConversationReport({
  viewModel,
  reportClient: customReportClient,
}: UseConversationReportOptions): UseConversationReportReturn {
  const client = customReportClient || defaultReportClient;

  // Initialize from view model
  const [versions, setVersions] = useState<ReportVersion[]>(viewModel.versions);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(
    viewModel.versions.length > 0 ? viewModel.versions[0].version : null
  );
  const [agreementSummaries, setAgreementSummaries] = useState<
    AgreementSummary[]
  >(viewModel.agreementSummaries ?? []);
  const [consensusItems, setConsensusItems] = useState<ConsensusItem[]>(
    viewModel.consensusItems ?? []
  );
  const [totalInteractions, setTotalInteractions] = useState<number>(
    viewModel.totalInteractions ?? 0
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute current HTML based on selected version
  const currentHtml = useMemo(() => {
    if (selectedVersion !== null) {
      const version = versions.find((v) => v.version === selectedVersion);
      if (version) {
        return version.html;
      }
    }

    // Fallback to viewModel report if no version selected
    return reportContentToHtml(viewModel.report);
  }, [selectedVersion, versions, viewModel.report]);

  /**
   * Generate a new report version
   */
  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await client.generate(viewModel.conversationId);

      if (!result.success) {
        setError(result.error || "Failed to generate report");
        return;
      }

      // Create new version entry
      const newVersion: ReportVersion = {
        version: result.version!,
        createdAt: result.createdAt || new Date().toISOString(),
        html: result.report!,
      };

      // Prepend to versions list and select it
      setVersions((prev) => [newVersion, ...prev]);
      setSelectedVersion(newVersion.version);

      if (result.agreementSummaries) {
        setAgreementSummaries(result.agreementSummaries);
      }
      if (result.consensusItems) {
        setConsensusItems(result.consensusItems);
      }
      if (typeof result.totalInteractions === "number") {
        setTotalInteractions(result.totalInteractions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [client, viewModel.conversationId]);

  /**
   * Download current HTML as file
   */
  const download = useCallback(() => {
    downloadHtmlBlob(currentHtml, "executive-summary.html");
  }, [currentHtml]);

  /**
   * Select a specific version to display
   */
  const selectVersion = useCallback((version: number) => {
    setSelectedVersion(version);
  }, []);

  return {
    currentHtml,
    selectedVersion,
    versions,
    agreementSummaries,
    consensusItems,
    totalInteractions,
    loading,
    error,
    generate,
    download,
    selectVersion,
  };
}
