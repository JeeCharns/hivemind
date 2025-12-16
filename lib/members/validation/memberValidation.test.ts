/**
 * Unit Tests for Member Validation Logic
 *
 * Tests pure validation functions in isolation
 * Demonstrates testability through SRP
 */

import {
  isValidRole,
  canRemoveMember,
  canChangeRole,
} from "./memberValidation";
import type { MemberViewModel } from "@/types/members";

describe("memberValidation", () => {
  describe("isValidRole", () => {
    it("should return true for 'admin'", () => {
      expect(isValidRole("admin")).toBe(true);
    });

    it("should return true for 'member'", () => {
      expect(isValidRole("member")).toBe(true);
    });

    it("should return false for invalid roles", () => {
      expect(isValidRole("owner")).toBe(false);
      expect(isValidRole("guest")).toBe(false);
      expect(isValidRole("")).toBe(false);
      expect(isValidRole("Admin")).toBe(false); // Case sensitive
    });
  });

  describe("canRemoveMember", () => {
    const createMember = (
      userId: string,
      role: "admin" | "member"
    ): MemberViewModel => ({
      userId,
      displayName: `User ${userId}`,
      avatarUrl: null,
      role,
    });

    it("should allow removing a regular member", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("member1", "member"),
      ];

      const result = canRemoveMember(members, "member1");
      expect(result.canRemove).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should prevent removing the only admin", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("member1", "member"),
      ];

      const result = canRemoveMember(members, "admin1");
      expect(result.canRemove).toBe(false);
      expect(result.reason).toContain("only admin");
    });

    it("should allow removing an admin when there are multiple admins", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("admin2", "admin"),
        createMember("member1", "member"),
      ];

      const result = canRemoveMember(members, "admin1");
      expect(result.canRemove).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should return error for non-existent member", () => {
      const members: MemberViewModel[] = [createMember("admin1", "admin")];

      const result = canRemoveMember(members, "nonexistent");
      expect(result.canRemove).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should handle edge case: empty members list", () => {
      const members: MemberViewModel[] = [];

      const result = canRemoveMember(members, "admin1");
      expect(result.canRemove).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should handle edge case: hive with only members (no admins)", () => {
      const members: MemberViewModel[] = [
        createMember("member1", "member"),
        createMember("member2", "member"),
      ];

      const result = canRemoveMember(members, "member1");
      expect(result.canRemove).toBe(true);
    });
  });

  describe("canChangeRole", () => {
    const createMember = (
      userId: string,
      role: "admin" | "member"
    ): MemberViewModel => ({
      userId,
      displayName: `User ${userId}`,
      avatarUrl: null,
      role,
    });

    it("should allow promoting a member to admin", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("member1", "member"),
      ];

      const result = canChangeRole(members, "member1", "admin");
      expect(result.canChange).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should prevent demoting the only admin", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("member1", "member"),
      ];

      const result = canChangeRole(members, "admin1", "member");
      expect(result.canChange).toBe(false);
      expect(result.reason).toContain("only admin");
    });

    it("should allow demoting an admin when there are multiple admins", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("admin2", "admin"),
        createMember("member1", "member"),
      ];

      const result = canChangeRole(members, "admin1", "member");
      expect(result.canChange).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should allow changing admin role to admin (no-op)", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("admin2", "admin"),
      ];

      const result = canChangeRole(members, "admin1", "admin");
      expect(result.canChange).toBe(true);
    });

    it("should allow demoting member to member (no-op)", () => {
      const members: MemberViewModel[] = [
        createMember("admin1", "admin"),
        createMember("member1", "member"),
      ];

      const result = canChangeRole(members, "member1", "member");
      expect(result.canChange).toBe(true);
    });

    it("should return error for non-existent member", () => {
      const members: MemberViewModel[] = [createMember("admin1", "admin")];

      const result = canChangeRole(members, "nonexistent", "member");
      expect(result.canChange).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should handle edge case: single admin demoting to member", () => {
      const members: MemberViewModel[] = [createMember("admin1", "admin")];

      const result = canChangeRole(members, "admin1", "member");
      expect(result.canChange).toBe(false);
      expect(result.reason).toContain("only admin");
    });

    it("should handle edge case: all members (no admins) promoting first admin", () => {
      const members: MemberViewModel[] = [
        createMember("member1", "member"),
        createMember("member2", "member"),
      ];

      const result = canChangeRole(members, "member1", "admin");
      expect(result.canChange).toBe(true);
    });
  });
});
