/**
 * Unit Tests for Storage Validation Logic
 *
 * Tests pure validation functions in isolation
 * Demonstrates testability through SRP
 */

import { validateImageFile, isHttpUrl } from "./validation";

describe("storage validation", () => {
  describe("validateImageFile", () => {
    it("should return null for valid PNG file under size limit", () => {
      const file = new File(["content"], "test.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 1024 * 1024 }); // 1MB

      const result = validateImageFile(file);
      expect(result).toBeNull();
    });

    it("should return null for valid JPEG file under size limit", () => {
      const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 1024 * 1024 }); // 1MB

      const result = validateImageFile(file);
      expect(result).toBeNull();
    });

    it("should return error for file exceeding size limit", () => {
      const file = new File(["content"], "test.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 3 * 1024 * 1024 }); // 3MB

      const result = validateImageFile(file, { maxMb: 2 });
      expect(result).toBe("File must be under 2MB.");
    });

    it("should return error for non-image file type", () => {
      const file = new File(["content"], "test.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 }); // 1KB

      const result = validateImageFile(file);
      expect(result).toBe("File must be a .png or .jpeg image.");
    });

    it("should return error for unsupported image type", () => {
      const file = new File(["content"], "test.gif", { type: "image/gif" });
      Object.defineProperty(file, "size", { value: 1024 }); // 1KB

      const result = validateImageFile(file);
      expect(result).toBe("File must be a .png or .jpeg image.");
    });

    it("should return null for null file", () => {
      const result = validateImageFile(null);
      expect(result).toBeNull();
    });

    it("should respect custom maxMb option", () => {
      const file = new File(["content"], "test.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 }); // 6MB

      const result = validateImageFile(file, { maxMb: 5 });
      expect(result).toBe("File must be under 5MB.");
    });

    it("should respect custom allowedTypes option", () => {
      const file = new File(["content"], "test.webp", { type: "image/webp" });
      Object.defineProperty(file, "size", { value: 1024 }); // 1KB

      const result = validateImageFile(file, {
        allowedTypes: ["image/png", "image/jpeg", "image/webp"],
      });
      expect(result).toBeNull();
    });

    it("should handle case-insensitive file types", () => {
      const file = new File(["content"], "test.PNG", { type: "IMAGE/PNG" });
      Object.defineProperty(file, "size", { value: 1024 }); // 1KB

      const result = validateImageFile(file);
      expect(result).toBeNull();
    });
  });

  describe("isHttpUrl", () => {
    it("should return true for http URL", () => {
      expect(isHttpUrl("http://example.com/image.png")).toBe(true);
    });

    it("should return true for https URL", () => {
      expect(isHttpUrl("https://example.com/image.png")).toBe(true);
    });

    it("should return false for relative path", () => {
      expect(isHttpUrl("images/logo.png")).toBe(false);
    });

    it("should return false for storage path", () => {
      expect(isHttpUrl("user-id/12345.png")).toBe(false);
    });

    it("should return false for null", () => {
      expect(isHttpUrl(null)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isHttpUrl("")).toBe(false);
    });

    it("should return false for ftp URL", () => {
      expect(isHttpUrl("ftp://example.com/file.png")).toBe(false);
    });
  });
});
