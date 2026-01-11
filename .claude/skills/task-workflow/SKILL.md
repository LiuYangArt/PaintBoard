---
name: task-workflow
description: Issue-driven development workflow with GitHub integration. Use when user says "/task-*", "start task", "wrap up", "pause task", "resume task", "sync status", or "list tasks". Manages GitHub Issues, branches, commits, and PRs with TodoWrite integration.
---

# Task Workflow

Issue-driven development workflow integrated with GitHub CLI and TodoWrite.

## Commands

| Command | Trigger | Action |
|---------|---------|--------|
| `/task-list` | "list tasks", "what's open" | Show issues, branches, PRs |
| `/task-start <desc>` | "start task X", "begin X" | Create Issue + branch |
| `/task-wrap-up` | "wrap up", "finish task", "submit" | Cleanup + verify + commit + PR + **merge** |
| `/task-pause` | "pause", "switch task" | Stash + record progress |
| `/task-resume <id>` | "resume #42", "continue task" | Restore stash + context |
| `/task-sync-status` | "sync status", "check merged" | **Batch** cleanup merged branches |

## Quick Workflow

```
/task-list → /task-start "描述" → 编码 → [用户验证] → /task-wrap-up
```

> 个人开发流程：wrap-up 会自动合并 PR 并切换回 main，无需等待 review。

## ⚠️ AI 行为规则

**编码完成后必须等待用户确认，不得自动执行 wrap-up：**

1. 完成编码后，告知用户"实现完成，请验证"
2. **只有用户明确说 "wrap up"、"完成任务"、"提交" 才执行合并流程**
3. 用户说"开始任务"仅触发 `/task-start`，不包含后续的 wrap-up

**测试要求（强制）：**

1. **新功能必须包含对应测试**（单元测试或功能测试）
2. `/task-start` 会自动创建测试骨架文件 `tests/features/<feature>.feature.ts`
3. **测试失败时不得执行 wrap-up**（脚本会自动阻止）
4. 修改 core 层代码时必须确保有对应测试
5. wrap-up 验证阶段会检查：测试覆盖、测试通过、类型检查、构建

## Scripts

Execute via bash:

```bash
bash scripts/task-list.sh
bash scripts/task-start.sh "任务描述" "milestone" "labels"
bash scripts/task-wrap-up.sh [--skip-cleanup] [--skip-verify] [--draft] [--no-merge]
bash scripts/task-pause.sh [--no-switch]
bash scripts/task-resume.sh <issue-number> | --last | --list
bash scripts/task-sync-status.sh [--all] [--clean]  # 批量清理用
```

## Branch Naming

```
<type>/<issue-number>-<short-description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `perf`

## Wrap-up Stages

1. **Cleanup** - ESLint, console.log, debugger, TODO/FIXME checks
2. **Verify** - Tests, type check, build
3. **Commit** - Conventional Commits format
4. **PR** - Auto-link with `Closes #issue`
5. **Merge** - Squash merge + cleanup (use `--no-merge` to skip)

## Type Auto-Detection

| Input | Type | Label |
|-------|------|-------|
| "添加"/"实现" | feat | enhancement |
| "fix:"/"修复" | fix | bug |
| "重构" | refactor | refactor |
| "文档" | docs | documentation |
| "优化"/"性能" | perf | performance |
