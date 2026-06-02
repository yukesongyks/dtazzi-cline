import { describe, expect, it } from "vitest";

import { shouldAutoConfirmClaudeWorkspaceTrust } from "../../src/terminal/claude-workspace-trust";

describe("shouldAutoConfirmClaudeWorkspaceTrust", () => {
    it("returns true for project-local worktree path with claude agent", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/user/projects/myrepo/.cline/worktrees/task-1/myrepo"),
        ).toBe(true);
    });

    it("returns true for legacy home-directory worktree path with claude agent", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/user/.cline/worktrees/task-1/myrepo"),
        ).toBe(true);
    });

    it("returns false for non-worktree path", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/user/projects/myrepo/src"),
        ).toBe(false);
    });

    it("returns false for non-claude agent even in worktree path", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("codex" as const, "/home/user/projects/myrepo/.cline/worktrees/task-1/myrepo"),
        ).toBe(false);
    });

    it("returns false for path that contains cline/worktrees but not .cline/worktrees", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/user/some-cline/workspaces/task-1"),
        ).toBe(false);
    });

    it("returns true for deeply nested project-local worktree path", () => {
        expect(
            shouldAutoConfirmClaudeWorkspaceTrust("claude", "/Users/alice/code/company/kanban/.cline/worktrees/abc123/kanban"),
        ).toBe(true);
    });
});