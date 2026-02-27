/** @jest-environment node */
/**
 * Integration tests for Deliberate Space API routes
 *
 * Tests deliberate session creation, voting, and commenting functionality
 */

import { POST } from "@/app/api/deliberate-space/route";
import { POST as VotesPost } from "@/app/api/conversations/[conversationId]/deliberate/votes/route";
import {
  POST as CommentsPost,
  DELETE as CommentsDelete,
} from "@/app/api/conversations/[conversationId]/deliberate/comments/route";
import { NextRequest } from "next/server";

// Mock dependencies
jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/deliberate-space/server/createDeliberateSession");
jest.mock("@/lib/deliberate-space/server/voteOnStatement");
jest.mock("@/lib/deliberate-space/server/addComment");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { createDeliberateSession } from "@/lib/deliberate-space/server/createDeliberateSession";
import { voteOnStatement } from "@/lib/deliberate-space/server/voteOnStatement";
import {
  addComment,
  deleteComment,
} from "@/lib/deliberate-space/server/addComment";

describe("Deliberate Space API", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockCreateDeliberateSession =
    createDeliberateSession as jest.MockedFunction<
      typeof createDeliberateSession
    >;
  const mockVoteOnStatement = voteOnStatement as jest.MockedFunction<
    typeof voteOnStatement
  >;
  const mockAddComment = addComment as jest.MockedFunction<typeof addComment>;
  const mockDeleteComment = deleteComment as jest.MockedFunction<
    typeof deleteComment
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    });

    mockSupabaseServerClient.mockResolvedValue(
      {} as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  describe("POST /api/deliberate-space", () => {
    it.todo("creates session from scratch");
    it.todo("creates session from understand source");
    it.todo("validates required fields");

    it("requires authentication", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = new NextRequest("http://localhost/api/deliberate-space", {
        method: "POST",
        body: JSON.stringify({
          hiveId: "11111111-1111-4111-8111-111111111111",
          title: "Test Deliberation",
          statements: [{ text: "Statement 1" }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorised");
    });

    it("creates deliberate session with valid input", async () => {
      mockCreateDeliberateSession.mockResolvedValue({
        conversationId: "conv-123",
        slug: "test-deliberation",
      });

      const request = new NextRequest("http://localhost/api/deliberate-space", {
        method: "POST",
        body: JSON.stringify({
          hiveId: "11111111-1111-4111-8111-111111111111",
          mode: "from-scratch",
          title: "Test Deliberation",
          description: "A test session",
          manualStatements: [{ text: "Statement 1" }, { text: "Statement 2" }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.conversationId).toBe("conv-123");
      expect(data.slug).toBe("test-deliberation");
      expect(mockCreateDeliberateSession).toHaveBeenCalledWith(
        expect.anything(),
        "user-123",
        expect.objectContaining({
          hiveId: "11111111-1111-4111-8111-111111111111",
          mode: "from-scratch",
          title: "Test Deliberation",
          description: "A test session",
        })
      );
    });

    it("rejects invalid hiveId format", async () => {
      const request = new NextRequest("http://localhost/api/deliberate-space", {
        method: "POST",
        body: JSON.stringify({
          hiveId: "not-a-uuid",
          title: "Test Deliberation",
          statements: [{ text: "Statement 1" }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("rejects missing title", async () => {
      const request = new NextRequest("http://localhost/api/deliberate-space", {
        method: "POST",
        body: JSON.stringify({
          hiveId: "11111111-1111-4111-8111-111111111111",
          statements: [{ text: "Statement 1" }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/conversations/.../deliberate/votes", () => {
    it.todo("casts vote on statement");
    it.todo("updates existing vote");
    it.todo("removes vote when value is null");
    it.todo("validates vote value range");

    it("requires authentication", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/votes",
        {
          method: "POST",
          body: JSON.stringify({
            statementId: "stmt-123",
            value: 4,
          }),
        }
      );

      const response = await VotesPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorised");
    });

    it("casts vote with valid input", async () => {
      mockVoteOnStatement.mockResolvedValue({
        success: true,
        voteValue: 4,
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/votes",
        {
          method: "POST",
          body: JSON.stringify({
            statementId: "11111111-1111-4111-8111-111111111111",
            voteValue: 4,
          }),
        }
      );

      const response = await VotesPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockVoteOnStatement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statementId: "11111111-1111-4111-8111-111111111111",
          voteValue: 4,
          userId: "user-123",
        })
      );
    });
  });

  describe("POST /api/conversations/.../deliberate/comments", () => {
    it.todo("adds comment to statement");
    it.todo("supports anonymous comments");

    it("requires authentication", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/comments",
        {
          method: "POST",
          body: JSON.stringify({
            statementId: "stmt-123",
            text: "This is a comment",
          }),
        }
      );

      const response = await CommentsPost(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorised");
    });

    it("adds comment with valid input", async () => {
      mockAddComment.mockResolvedValue({
        id: 123,
        createdAt: new Date().toISOString(),
      });

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/comments",
        {
          method: "POST",
          body: JSON.stringify({
            statementId: "11111111-1111-4111-8111-111111111111",
            text: "This is a comment",
            isAnonymous: false,
          }),
        }
      );

      const response = await CommentsPost(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBe(123);
      expect(mockAddComment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statementId: "11111111-1111-4111-8111-111111111111",
          text: "This is a comment",
          isAnonymous: false,
          userId: "user-123",
        })
      );
    });
  });

  describe("DELETE /api/conversations/.../deliberate/comments", () => {
    it.todo("deletes own comment");
    it.todo("prevents deleting others comments");

    it("requires authentication", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/comments?commentId=comment-123",
        {
          method: "DELETE",
        }
      );

      const response = await CommentsDelete(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorised");
    });

    it("deletes comment with valid input", async () => {
      mockDeleteComment.mockResolvedValue(true);

      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/comments?commentId=123",
        {
          method: "DELETE",
        }
      );

      const response = await CommentsDelete(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDeleteComment).toHaveBeenCalledWith(
        expect.anything(),
        123,
        "user-123"
      );
    });

    it("rejects invalid commentId format", async () => {
      const request = new NextRequest(
        "http://localhost/api/conversations/conv-123/deliberate/comments?commentId=not-a-number",
        {
          method: "DELETE",
        }
      );

      const response = await CommentsDelete(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });
});
