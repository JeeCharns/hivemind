/**
 * Tests for useNewSessionWizard hook
 *
 * Tests state management, event handlers, and error handling
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useNewSessionWizard } from "../useNewSessionWizard";
import * as conversationApi from "../../client/conversationApi";

// Mock Next.js router
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock conversation API
jest.mock("../../client/conversationApi");

describe("useNewSessionWizard", () => {
  const defaultProps = {
    hiveId: "hive-123",
    hiveSlug: "test-hive",
    open: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("State initialization", () => {
    it("should initialize with default state when open", () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      expect(result.current.step).toBe(1);
      expect(result.current.loading).toBe(false);
      expect(result.current.type).toBe("understand");
      expect(result.current.title).toBe("");
      expect(result.current.description).toBe("");
      expect(result.current.file).toBeNull();
    });

    it("should reset state when modal reopens", () => {
      const { result, rerender } = renderHook(
        (props) => useNewSessionWizard(props),
        { initialProps: defaultProps }
      );

      // Modify state
      act(() => {
        result.current.setTitle("Test Title");
        result.current.setType("decide");
      });

      // Close modal
      rerender({ ...defaultProps, open: false });

      // Reopen modal
      rerender({ ...defaultProps, open: true });

      // State should be reset
      expect(result.current.title).toBe("");
      expect(result.current.type).toBe("understand");
    });
  });

  describe("Step 1 - Create Conversation", () => {
    it("should validate title before continuing", async () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      await act(async () => {
        await result.current.onContinue();
      });

      expect(result.current.titleError).toBe("A session title is required.");
      expect(result.current.step).toBe(1);
    });

    it("should advance to step 2 without creating conversation", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("Test Session");
      });

      await act(async () => {
        await result.current.onContinue();
      });

      await waitFor(() => {
        expect(result.current.step).toBe(2);
        expect(result.current.conversationId).toBe(null); // Not created yet
      });

      // Conversation should not be created in step 1
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should handle creation errors in onSkipImport", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      // Create a proper Error with message property
      const error = Object.assign(new Error("Unauthorized"), {
        name: "ConversationApiError",
      });
      mockCreate.mockRejectedValue(error);

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("Test Session");
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Try to skip import (which creates conversation)
      await act(async () => {
        await result.current.onSkipImport();
      });

      await waitFor(
        () => {
          expect(result.current.wizardError).toBeTruthy();
          // The error is caught and falls back to generic message since instanceof check fails in tests
          expect(result.current.wizardError).toBe("Failed to create session");
        },
        { timeout: 2000 }
      );
    });

    it("should trim whitespace from title and description when creating conversation", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("  Test Session  ");
        result.current.setDescription("  Test Description  ");
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Create conversation via onSkipImport
      await act(async () => {
        await result.current.onSkipImport();
      });

      expect(mockCreate).toHaveBeenCalledWith({
        hiveId: "hive-123",
        type: "understand",
        title: "Test Session",
        description: "Test Description",
        sourceConversationId: undefined,
        sourceReportVersion: undefined,
      });
    });
  });

  describe("Step 2 - File Upload", () => {
    it("should validate file type", () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const invalidFile = new File(["content"], "test.txt", {
        type: "text/plain",
      });

      act(() => {
        result.current.onFileSelected(invalidFile);
      });

      expect(result.current.file).toBeNull();
      expect(result.current.uploadError).toBe("Only .csv files are supported");
    });

    it("should validate file size", () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      // Create a large file (>10MB)
      const largeContent = "a".repeat(11 * 1024 * 1024);
      const largeFile = new File([largeContent], "test.csv", {
        type: "text/csv",
      });

      act(() => {
        result.current.onFileSelected(largeFile);
      });

      expect(result.current.file).toBeNull();
      expect(result.current.uploadError).toContain("File size must be less than");
    });

    it("should accept valid CSV file", () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      act(() => {
        result.current.onFileSelected(validFile);
      });

      expect(result.current.file).toBe(validFile);
      expect(result.current.uploadError).toBeNull();
    });

    it("should skip import and navigate (creating conversation first)", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("Test Session");
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Skip import - should create conversation and navigate
      await act(async () => {
        await result.current.onSkipImport();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "/hives/test-hive/conversations/conv-123/listen"
        );
      });

      expect(mockCreate).toHaveBeenCalledWith({
        hiveId: "hive-123",
        type: "understand",
        title: "Test Session",
        description: undefined,
        sourceConversationId: undefined,
        sourceReportVersion: undefined,
      });
    });

    it("should upload file and navigate (creating conversation first)", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;
      const mockAnalyze = conversationApi.startConversationAnalysis as jest.MockedFunction<
        typeof conversationApi.startConversationAnalysis
      >;

      mockCreate.mockResolvedValue({ id: "conv-123" });
      mockUpload.mockResolvedValue({ importedCount: 5 });
      mockAnalyze.mockResolvedValue({ status: "queued" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      act(() => {
        result.current.setTitle("Test Session");
        result.current.onFileSelected(validFile);
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Finish - should create conversation, upload file, and navigate
      await act(async () => {
        await result.current.onFinish();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "/hives/test-hive/conversations/conv-123/listen"
        );
      });

      expect(mockCreate).toHaveBeenCalled();
      expect(mockUpload).toHaveBeenCalledWith("conv-123", validFile);
      expect(mockAnalyze).toHaveBeenCalledWith("conv-123");
    });

    it("should handle upload errors", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;

      mockCreate.mockResolvedValue({ id: "conv-123" });
      // Create a proper Error with message property
      const error = Object.assign(new Error("Invalid CSV"), {
        name: "ConversationApiError",
      });
      mockUpload.mockRejectedValue(error);

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      act(() => {
        result.current.setTitle("Test Session");
        result.current.onFileSelected(validFile);
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Finish - should create conversation then fail on upload
      await act(async () => {
        await result.current.onFinish();
      });

      await waitFor(
        () => {
          expect(result.current.uploadError).toBeTruthy();
          // The error is caught and falls back to generic message since instanceof check fails in tests
          expect(result.current.uploadError).toContain("Failed to create session or upload file");
          expect(result.current.uploadStatus).toBe("error");
        },
        { timeout: 2000 }
      );
    });

    it("should navigate even if analysis fails", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;
      const mockAnalyze = conversationApi.startConversationAnalysis as jest.MockedFunction<
        typeof conversationApi.startConversationAnalysis
      >;

      mockCreate.mockResolvedValue({ id: "conv-123" });
      mockUpload.mockResolvedValue({ importedCount: 5 });
      mockAnalyze.mockRejectedValue(new Error("Analysis failed"));

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      act(() => {
        result.current.setTitle("Test Session");
        result.current.onFileSelected(validFile);
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Finish - should create, upload, and navigate despite analysis failure
      await act(async () => {
        await result.current.onFinish();
      });

      // Should still navigate despite analysis failure
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });
    });
  });

  describe("Navigation", () => {
    it("should use hiveSlug in URL when available", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() =>
        useNewSessionWizard({ ...defaultProps, hiveSlug: "my-hive" })
      );

      act(() => {
        result.current.setTitle("Test Session");
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Skip import - creates conversation and navigates
      await act(async () => {
        await result.current.onSkipImport();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "/hives/my-hive/conversations/conv-123/listen"
        );
      });
    });

    it("should fall back to hiveId when slug is null", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() =>
        useNewSessionWizard({ ...defaultProps, hiveSlug: null })
      );

      act(() => {
        result.current.setTitle("Test Session");
      });

      // Advance to step 2
      await act(async () => {
        await result.current.onContinue();
      });

      // Skip import - creates conversation and navigates
      await act(async () => {
        await result.current.onSkipImport();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "/hives/hive-123/conversations/conv-123/listen"
        );
      });
    });
  });
});
