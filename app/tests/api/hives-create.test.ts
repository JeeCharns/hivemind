/** @jest-environment node */
/**
 * Integration tests for POST /api/hives
 *
 * Tests hive creation with authentication and validation (JSON + multipart).
 */

import { POST } from "@/app/api/hives/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/serverClient");
jest.mock("@/lib/auth/server/requireAuth");
jest.mock("@/lib/hives/server/createHive");

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { createHive } from "@/lib/hives/server/createHive";

describe("POST /api/hives", () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<
    typeof getServerSession
  >;
  const mockSupabaseServerClient = supabaseServerClient as jest.MockedFunction<
    typeof supabaseServerClient
  >;
  const mockCreateHive = createHive as jest.MockedFunction<typeof createHive>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com" },
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    mockSupabaseServerClient.mockResolvedValue(
      {} as Awaited<ReturnType<typeof supabaseServerClient>>
    );
  });

  it("should reject unauthenticated user", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Hive" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized: Not authenticated");
    expect(mockCreateHive).not.toHaveBeenCalled();
  });

  it("should reject invalid JSON body", async () => {
    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(mockCreateHive).not.toHaveBeenCalled();
  });

  it("should create hive from JSON", async () => {
    mockCreateHive.mockResolvedValue({
      id: "hive-1",
      slug: "test-hive",
      name: "Test Hive",
      logo_url: null,
    } as unknown as Awaited<ReturnType<typeof createHive>>);

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Hive" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe("test-hive");
    expect(mockCreateHive).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { name: "Test Hive", logoUrl: null, logoFile: null, visibility: "public" }
    );
  });

  it("should reject invalid logo file type", async () => {
    const formData = new FormData();
    formData.append("name", "Test Hive");
    formData.append(
      "logo",
      new File([Buffer.from("nope")], "logo.txt", { type: "text/plain" })
    );

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("UPLOAD_FAILED");
    expect(mockCreateHive).not.toHaveBeenCalled();
  });

  it("should create hive from multipart with logo file", async () => {
    mockCreateHive.mockResolvedValue({
      id: "hive-1",
      slug: "test-hive",
      name: "Test Hive",
      logo_url: "hive-1/logo.png",
    } as unknown as Awaited<ReturnType<typeof createHive>>);

    const formData = new FormData();
    formData.append("name", "Test Hive");
    formData.append(
      "logo",
      new File([Buffer.from("image")], "logo.png", { type: "image/png" })
    );

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("hive-1");
    expect(mockCreateHive).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      expect.objectContaining({
        name: "Test Hive",
        logoUrl: null,
      })
    );

    const input = mockCreateHive.mock.calls[0]?.[2];
    expect(input?.logoFile).toEqual(
      expect.objectContaining({
        fileName: "logo.png",
        contentType: "image/png",
      })
    );
  });

  it("should create hive with private visibility from JSON", async () => {
    mockCreateHive.mockResolvedValue({
      id: "hive-1",
      slug: "test-hive",
      name: "Test Hive",
      logo_url: null,
      visibility: "private",
    } as unknown as Awaited<ReturnType<typeof createHive>>);

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Hive", visibility: "private" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCreateHive).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      expect.objectContaining({
        name: "Test Hive",
        visibility: "private",
      })
    );
  });

  it("should create hive with private visibility from multipart form", async () => {
    mockCreateHive.mockResolvedValue({
      id: "hive-1",
      slug: "test-hive",
      name: "Test Hive",
      logo_url: null,
      visibility: "private",
    } as unknown as Awaited<ReturnType<typeof createHive>>);

    const formData = new FormData();
    formData.append("name", "Test Hive");
    formData.append("visibility", "private");

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCreateHive).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      expect.objectContaining({
        name: "Test Hive",
        visibility: "private",
      })
    );
  });

  it("should default to public for invalid visibility value in form data", async () => {
    mockCreateHive.mockResolvedValue({
      id: "hive-1",
      slug: "test-hive",
      name: "Test Hive",
      logo_url: null,
      visibility: "public",
    } as unknown as Awaited<ReturnType<typeof createHive>>);

    const formData = new FormData();
    formData.append("name", "Test Hive");
    formData.append("visibility", "invalid");

    const request = new NextRequest("http://localhost/api/hives", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockCreateHive).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      expect.objectContaining({
        name: "Test Hive",
        visibility: "public",
      })
    );
  });
});

