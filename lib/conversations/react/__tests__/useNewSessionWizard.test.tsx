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

    it("should create conversation and advance to step 2", async () => {
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
        expect(result.current.conversationId).toBe("conv-123");
      });

      expect(mockCreate).toHaveBeenCalledWith({
        hiveId: "hive-123",
        type: "understand",
        title: "Test Session",
        description: undefined,
      });
    });

    it("should handle creation errors", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockRejectedValue(
        new conversationApi.ConversationApiError("Unauthorized")
      );

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("Test Session");
      });

      await act(async () => {
        await result.current.onContinue();
      });

      await waitFor(() => {
        expect(result.current.wizardError).toBe("Unauthorized");
        expect(result.current.step).toBe(1);
      });
    });

    it("should trim whitespace from title and description", async () => {
      const mockCreate = conversationApi.createConversation as jest.MockedFunction<
        typeof conversationApi.createConversation
      >;
      mockCreate.mockResolvedValue({ id: "conv-123" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      act(() => {
        result.current.setTitle("  Test Session  ");
        result.current.setDescription("  Test Description  ");
      });

      await act(async () => {
        await result.current.onContinue();
      });

      expect(mockCreate).toHaveBeenCalledWith({
        hiveId: "hive-123",
        type: "understand",
        title: "Test Session",
        description: "Test Description",
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

    it("should skip import and navigate", async () => {
      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      // Set conversation ID (simulate step 2)
      act(() => {
        result.current.step;
      });

      await act(async () => {
        // Manually set conversationId for test
        (result.current as any).conversationId = "conv-123";
      });

      act(() => {
        result.current.onSkipImport();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/hives/test-hive/conversations/conv-123/listen"
      );
    });

    it("should upload file and navigate", async () => {
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;
      const mockAnalyze = conversationApi.startConversationAnalysis as jest.MockedFunction<
        typeof conversationApi.startConversationAnalysis
      >;

      mockUpload.mockResolvedValue({ importedCount: 5 });
      mockAnalyze.mockResolvedValue({ status: "queued" });

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      // Set state as if we're on step 2
      await act(async () => {
        (result.current as any).conversationId = "conv-123";
        result.current.onFileSelected(validFile);
      });

      await act(async () => {
        await result.current.onFinish();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          "/hives/test-hive/conversations/conv-123/listen"
        );
      });

      expect(mockUpload).toHaveBeenCalledWith("conv-123", validFile);
      expect(mockAnalyze).toHaveBeenCalledWith("conv-123");
    });

    it("should handle upload errors", async () => {
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;
      mockUpload.mockRejectedValue(
        new conversationApi.ConversationApiError("Invalid CSV")
      );

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      await act(async () => {
        (result.current as any).conversationId = "conv-123";
        result.current.onFileSelected(validFile);
      });

      await act(async () => {
        await result.current.onFinish();
      });

      await waitFor(() => {
        expect(result.current.uploadError).toBe("Invalid CSV");
        expect(result.current.uploadStatus).toBe("error");
      });
    });

    it("should navigate even if analysis fails", async () => {
      const mockUpload = conversationApi.uploadConversationCsv as jest.MockedFunction<
        typeof conversationApi.uploadConversationCsv
      >;
      const mockAnalyze = conversationApi.startConversationAnalysis as jest.MockedFunction<
        typeof conversationApi.startConversationAnalysis
      >;

      mockUpload.mockResolvedValue({ importedCount: 5 });
      mockAnalyze.mockRejectedValue(new Error("Analysis failed"));

      const { result } = renderHook(() => useNewSessionWizard(defaultProps));

      const validFile = new File(["response\ntest"], "test.csv", {
        type: "text/csv",
      });

      await act(async () => {
        (result.current as any).conversationId = "conv-123";
        result.current.onFileSelected(validFile);
      });

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
      const { result } = renderHook(() =>
        useNewSessionWizard({ ...defaultProps, hiveSlug: "my-hive" })
      );

      await act(async () => {
        (result.current as any).conversationId = "conv-123";
      });

      act(() => {
        result.current.onSkipImport();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/hives/my-hive/conversations/conv-123/listen"
      );
    });

    it("should fall back to hiveId when slug is null", async () => {
      const { result } = renderHook(() =>
        useNewSessionWizard({ ...defaultProps, hiveSlug: null })
      );

      await act(async () => {
        (result.current as any).conversationId = "conv-123";
      });

      act(() => {
        result.current.onSkipImport();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/hives/hive-123/conversations/conv-123/listen"
      );
    });
  });
});
