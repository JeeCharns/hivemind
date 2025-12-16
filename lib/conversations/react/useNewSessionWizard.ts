/**
 * useNewSessionWizard Hook
 *
 * Manages state and logic for the New Session Wizard
 * Follows SRP: separates wizard state management from UI rendering
 * Provides type-safe handlers for all wizard interactions
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ConversationType } from "@/types/conversations";
import {
  createConversation,
  uploadConversationCsv,
  startConversationAnalysis,
  ConversationApiError,
} from "../client/conversationApi";

export interface UseNewSessionWizardProps {
  hiveId: string;
  hiveSlug?: string | null;
  open: boolean;
}

export interface UseNewSessionWizardReturn {
  // State
  step: 1 | 2;
  loading: boolean;
  wizardError: string | null;
  titleError: string | null;
  typeError: string | null;
  conversationId: string | null;
  type: ConversationType;
  title: string;
  description: string;
  file: File | null;
  uploadStatus: "idle" | "uploading" | "uploaded" | "error";
  uploadError: string | null;

  // Handlers
  setType: (type: ConversationType) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  onContinue: () => Promise<void>;
  onBack: () => void;
  onFileSelected: (file: File | null) => void;
  onFileDropped: (e: React.DragEvent<HTMLLabelElement>) => void;
  onSkipImport: () => void;
  onFinish: () => Promise<void>;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Custom hook for managing New Session Wizard state and behavior
 */
export function useNewSessionWizard({
  hiveId,
  hiveSlug,
  open,
}: UseNewSessionWizardProps): UseNewSessionWizardReturn {
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Form fields
  const [type, setType] = useState<ConversationType>("understand");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Reset wizard when modal opens/closes
  useEffect(() => {
    if (!open) return;

    setStep(1);
    setWizardError(null);
    setTitleError(null);
    setTypeError(null);
    setConversationId(null);
    setTitle("");
    setDescription("");
    setFile(null);
    setUploadStatus("idle");
    setUploadError(null);
  }, [open]);

  /**
   * Validate file before setting
   */
  const validateAndSetFile = useCallback((selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      setUploadError(null);
      setUploadStatus("idle");
      return;
    }

    // Validate file extension
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Only .csv files are supported");
      setFile(null);
      setUploadStatus("idle");
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File size must be less than ${MAX_FILE_SIZE_MB}MB`);
      setFile(null);
      setUploadStatus("idle");
      return;
    }

    // Validate MIME type (if available)
    if (
      selectedFile.type &&
      !["text/csv", "application/vnd.ms-excel"].includes(selectedFile.type)
    ) {
      setUploadError("Invalid file type. Please upload a CSV file");
      setFile(null);
      setUploadStatus("idle");
      return;
    }

    setFile(selectedFile);
    setUploadError(null);
    setUploadStatus("idle");
  }, []);

  /**
   * Handle file selection from input
   */
  const onFileSelected = useCallback(
    (selectedFile: File | null) => {
      validateAndSetFile(selectedFile);
    },
    [validateAndSetFile]
  );

  /**
   * Handle file drop
   */
  const onFileDropped = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;
      validateAndSetFile(files[0]);
    },
    [validateAndSetFile]
  );

  /**
   * Navigate to conversation listen page
   */
  const navigateToConversation = useCallback(
    (convId: string) => {
      const hiveKey = hiveSlug ?? hiveId;
      router.push(`/hives/${hiveKey}/conversations/${convId}/listen`);
    },
    [router, hiveSlug, hiveId]
  );

  /**
   * Step 1: Create conversation and advance to step 2
   */
  const onContinue = useCallback(async () => {
    // Clear previous errors
    setWizardError(null);
    setTitleError(null);
    setTypeError(null);

    // Client-side validation
    let hasError = false;

    if (!title.trim()) {
      setTitleError("A session title is required.");
      hasError = true;
    }

    if (!type) {
      setTypeError("Select a session type.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setLoading(true);

    try {
      const result = await createConversation({
        hiveId,
        type,
        title: title.trim(),
        description: description.trim() || undefined,
      });

      setConversationId(result.id);
      setStep(2);
    } catch (err) {
      const message =
        err instanceof ConversationApiError
          ? err.message
          : "Failed to create session";
      setWizardError(message);
    } finally {
      setLoading(false);
    }
  }, [hiveId, type, title, description]);

  /**
   * Go back to step 1
   */
  const onBack = useCallback(() => {
    setStep(1);
  }, []);

  /**
   * Skip import and navigate to conversation
   */
  const onSkipImport = useCallback(() => {
    if (!conversationId) {
      setWizardError("Create the session first.");
      return;
    }
    navigateToConversation(conversationId);
  }, [conversationId, navigateToConversation]);

  /**
   * Step 2: Upload CSV (if provided) and navigate to conversation
   */
  const onFinish = useCallback(async () => {
    if (!conversationId) {
      setWizardError("Create the session first.");
      return;
    }

    // If no file, just navigate
    if (!file) {
      navigateToConversation(conversationId);
      return;
    }

    setLoading(true);
    setUploadStatus("uploading");
    setUploadError(null);

    try {
      // Upload CSV
      await uploadConversationCsv(conversationId, file);
      setUploadStatus("uploaded");

      // Kick off analysis (fire-and-forget, failures are ok)
      startConversationAnalysis(conversationId).catch(() => {
        // Silently fail - analysis can be triggered later
      });

      // Navigate to conversation
      navigateToConversation(conversationId);
    } catch (err) {
      const message =
        err instanceof ConversationApiError ? err.message : "Upload failed";
      setUploadStatus("error");
      setUploadError(message);
    } finally {
      setLoading(false);
    }
  }, [conversationId, file, navigateToConversation]);

  return {
    // State
    step,
    loading,
    wizardError,
    titleError,
    typeError,
    conversationId,
    type,
    title,
    description,
    file,
    uploadStatus,
    uploadError,

    // Handlers
    setType,
    setTitle,
    setDescription,
    onContinue,
    onBack,
    onFileSelected,
    onFileDropped,
    onSkipImport,
    onFinish,
  };
}
