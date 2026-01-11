#!/bin/bash
# task-wrap-up.sh - 完成任务：验证、提交、创建 PR

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 获取 gh CLI 路径
GH_CLI="${GH_CLI:-gh}"
if ! command -v "$GH_CLI" &> /dev/null; then
    if [ -f "/c/Program Files/GitHub CLI/gh.exe" ]; then
        GH_CLI="/c/Program Files/GitHub CLI/gh.exe"
    elif [ -f "/mnt/c/Program Files/GitHub CLI/gh.exe" ]; then
        GH_CLI="/mnt/c/Program Files/GitHub CLI/gh.exe"
    else
        echo "错误: 找不到 gh CLI"
        exit 1
    fi
fi

# 解析参数
SKIP_CLEANUP=false
SKIP_VERIFY=false
NO_PR=false
DRAFT=false
NO_MERGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        --skip-verify)
            SKIP_VERIFY=true
            shift
            ;;
        --no-pr)
            NO_PR=true
            shift
            ;;
        --draft)
            DRAFT=true
            NO_MERGE=true  # Draft PR 不自动合并
            shift
            ;;
        --no-merge)
            NO_MERGE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo -e "${BLUE}🏁 任务收尾${NC}"
echo ""

# 获取当前分支
BRANCH=$(git branch --show-current)

# 检查是否在主分支
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo -e "${RED}❌ 当前在主分支 ($BRANCH)，请先切换到 feature 分支${NC}"
    exit 1
fi

# 提取 Issue 号和类型
ISSUE=$(echo "$BRANCH" | grep -oE '[0-9]+' | head -1)
TYPE=$(echo "$BRANCH" | cut -d'/' -f1)

echo -e "${YELLOW}🔍 当前状态${NC}"
echo "  分支: $BRANCH"
echo "  Issue: #$ISSUE"
echo "  类型: $TYPE"
echo ""

# 检查是否有更改
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    echo -e "${YELLOW}⚠️  没有检测到更改${NC}"
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# 清理阶段
CLEANUP_WARNINGS=0
if [ "$SKIP_CLEANUP" = false ]; then
    echo -e "${YELLOW}🧹 清理阶段${NC}"

    # ESLint 检查
    if [ -f "package.json" ] && grep -q '"eslint"' package.json; then
        echo -n "  ESLint 检查... "
        # 只检查变更的文件
        CHANGED_FILES=$(git diff --name-only --cached HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
        if [ -z "$CHANGED_FILES" ]; then
            CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
        fi

        if [ -n "$CHANGED_FILES" ]; then
            LINT_OUTPUT=$(npx eslint $CHANGED_FILES 2>&1 || true)
            LINT_ERRORS=$(echo "$LINT_OUTPUT" | grep -c "error" || echo "0")
            LINT_WARNINGS=$(echo "$LINT_OUTPUT" | grep -c "warning" || echo "0")

            if [ "$LINT_ERRORS" -gt 0 ]; then
                echo -e "${RED}✗ $LINT_ERRORS 个错误${NC}"
                echo "$LINT_OUTPUT" | head -20
                CLEANUP_WARNINGS=$((CLEANUP_WARNINGS + 1))
            elif [ "$LINT_WARNINGS" -gt 0 ]; then
                echo -e "${YELLOW}⚠ $LINT_WARNINGS 个警告${NC}"
            else
                echo -e "${GREEN}✓ 通过${NC}"
            fi
        else
            echo -e "${GREEN}✓ 无需检查${NC}"
        fi
    else
        echo "  ESLint 检查... 跳过 (未配置)"
    fi

    # console.log 检查
    echo -n "  console.log 检查... "
    CONSOLE_LOGS=$(git diff HEAD --unified=0 2>/dev/null | grep -E '^\+.*console\.(log|debug|info)' | grep -v '^\+\+\+' || true)
    if [ -n "$CONSOLE_LOGS" ]; then
        CONSOLE_COUNT=$(echo "$CONSOLE_LOGS" | wc -l)
        echo -e "${YELLOW}⚠ 发现 $CONSOLE_COUNT 处${NC}"
        echo "$CONSOLE_LOGS" | head -5 | sed 's/^/    /'
        CLEANUP_WARNINGS=$((CLEANUP_WARNINGS + 1))
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi

    # debugger 检查
    echo -n "  debugger 检查... "
    DEBUGGERS=$(git diff HEAD --unified=0 2>/dev/null | grep -E '^\+.*debugger' | grep -v '^\+\+\+' || true)
    if [ -n "$DEBUGGERS" ]; then
        DEBUGGER_COUNT=$(echo "$DEBUGGERS" | wc -l)
        echo -e "${RED}✗ 发现 $DEBUGGER_COUNT 处 debugger 语句${NC}"
        echo "$DEBUGGERS" | sed 's/^/    /'
        CLEANUP_WARNINGS=$((CLEANUP_WARNINGS + 1))
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi

    # TODO/FIXME 检查
    echo -n "  TODO/FIXME 检查... "
    TODOS=$(git diff HEAD --unified=0 2>/dev/null | grep -E '^\+.*(TODO|FIXME|XXX|HACK):?' | grep -v '^\+\+\+' || true)
    if [ -n "$TODOS" ]; then
        TODO_COUNT=$(echo "$TODOS" | wc -l)
        echo -e "${YELLOW}⚠ 发现 $TODO_COUNT 处${NC}"
        echo "$TODOS" | head -5 | sed 's/^/    /'
        CLEANUP_WARNINGS=$((CLEANUP_WARNINGS + 1))
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi

    echo ""

    # 如果有警告，询问是否继续
    if [ "$CLEANUP_WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}发现 $CLEANUP_WARNINGS 类清理问题${NC}"
        read -p "是否继续提交? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}💡 请清理后重新运行${NC}"
            exit 0
        fi
        echo ""
    fi
fi

# 验证阶段
if [ "$SKIP_VERIFY" = false ]; then
    echo -e "${YELLOW}🧪 验证阶段${NC}"

    # 测试覆盖检查（core 层文件必须有对应测试）
    echo -n "  测试覆盖检查... "
    # 获取主分支名
    if git show-ref --verify --quiet refs/heads/main; then
        BASE_BRANCH="main"
    else
        BASE_BRANCH="master"
    fi
    CHANGED_SRC=$(git diff --name-only "$BASE_BRANCH" | grep -E 'src/core/.*\.ts$' | grep -v '\.test\.ts$' | grep -v 'index\.ts$' || true)
    MISSING_TESTS=""
    for f in $CHANGED_SRC; do
        TEST_FILE="${f%.ts}.test.ts"
        # 也检查 tests/features 目录
        FEATURE_TEST=$(echo "$f" | sed 's|src/core/||' | sed 's|/[^/]*$||' | xargs -I{} echo "tests/features/{}")
        if [ ! -f "$TEST_FILE" ] && [ -z "$(find tests/features -name '*.feature.ts' 2>/dev/null | head -1)" ]; then
            MISSING_TESTS="$MISSING_TESTS\n  - $f"
        fi
    done
    if [ -n "$MISSING_TESTS" ]; then
        echo -e "${RED}✗ 以下 core 层文件缺少测试:${NC}$MISSING_TESTS"
        echo "请添加对应的 .test.ts 或 .feature.ts 文件"
        exit 1
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi

    # 单元测试
    if [ -f "package.json" ] && grep -q '"test' package.json; then
        echo -n "  运行测试... "
        if npm run test:run > /dev/null 2>&1; then
            echo -e "${GREEN}✓ 通过${NC}"
        else
            echo -e "${RED}✗ 测试失败${NC}"
            echo "请修复测试后重新运行"
            exit 1
        fi
    fi

    # 类型检查
    if [ -f "tsconfig.json" ]; then
        echo -n "  类型检查... "
        if npx tsc --noEmit > /dev/null 2>&1; then
            echo -e "${GREEN}✓ 通过${NC}"
        else
            echo -e "${RED}✗ 类型检查失败${NC}"
            exit 1
        fi
    fi

    # 构建
    if [ -f "package.json" ] && grep -q '"build' package.json; then
        echo -n "  构建检查... "
        if npm run build > /dev/null 2>&1; then
            echo -e "${GREEN}✓ 通过${NC}"
        else
            echo -e "${RED}✗ 构建失败${NC}"
            exit 1
        fi
    fi

    echo ""
fi

# 查看变更
echo -e "${YELLOW}📂 变更文件${NC}"
git status --short
echo ""

# 提交阶段
echo -e "${YELLOW}📝 提交阶段${NC}"

# 获取最近的 commit 风格
LAST_SUBJECT=$(git log -1 --pretty=%s 2>/dev/null || echo "")

echo "请输入 commit subject (留空自动生成):"
read -r COMMIT_SUBJECT

if [ -z "$COMMIT_SUBJECT" ]; then
    # 自动生成
    if [ -n "$LAST_SUBJECT" ]; then
        # 参考最近的 commit 格式
        COMMIT_SUBJECT="$TYPE(#$ISSUE): $(echo "$LAST_SUBJECT" | sed 's/^[^:]*: //')"
    else
        COMMIT_SUBJECT="$TYPE(#$ISSUE): update"
    fi
fi

# 添加所有更改
git add -A

# 提交
git commit -m "$COMMIT_SUBJECT

🤖 Generated with task-workflow
Co-Authored-By: Claude <noreply@anthropic.com>"

COMMIT_HASH=$(git rev-parse --short HEAD)
echo -e "${GREEN}✓ 提交: $COMMIT_HASH${NC}"
echo ""

# 推送
echo -e "${YELLOW}⬆️  推送...${NC}"
git push -u origin HEAD
echo ""

# 创建 PR
if [ "$NO_PR" = false ]; then
    echo -e "${YELLOW}🔗 创建 PR...${NC}"

    PR_BODY="## Summary

实现 $TYPE 功能

## Verification

- [x] 代码符合规范
- [x] 测试通过

## Related Issue

Closes #$ISSUE

---
🤖 Generated with task-workflow"

    GH_PR_CMD="$GH_CLI pr create --title \"$COMMIT_SUBJECT\" --body \"$PR_BODY\""

    if [ "$DRAFT" = true ]; then
        GH_PR_CMD="$GH_PR_CMD --draft"
    fi

    PR_OUTPUT=$(eval "$GH_PR_CMD 2>&1")
    PR_URL=$(echo "$PR_OUTPUT" | grep -oE 'https://github.com/[^[:space:]]+' | head -1)
    PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$' | head -1)

    if [ -n "$PR_NUMBER" ]; then
        echo -e "${GREEN}✓ PR #$PR_NUMBER 已创建${NC}"
        echo "  $PR_URL"
    else
        echo -e "${YELLOW}⚠️  PR 创建可能失败${NC}"
        echo "$PR_OUTPUT"
    fi
    echo ""

    # 合并 PR（除非使用 --draft 或 --no-merge）
    if [ "$NO_MERGE" = false ] && [ -n "$PR_NUMBER" ]; then
        echo -e "${YELLOW}🔀 合并 PR...${NC}"
        if "$GH_CLI" pr merge --squash --delete-branch > /dev/null 2>&1; then
            echo -e "${GREEN}✓ PR #$PR_NUMBER 已合并 (squash)${NC}"
            echo -e "${GREEN}✓ 远程分支已删除${NC}"
        else
            echo -e "${YELLOW}⚠️  合并失败，请手动检查${NC}"
            NO_MERGE=true  # 阻止后续清理
        fi
        echo ""
    fi
fi

# 获取主分支名
if git show-ref --verify --quiet refs/heads/main; then
    MAIN_BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    MAIN_BRANCH="master"
else
    MAIN_BRANCH=""
fi

# 清理与同步（仅在成功合并后）
if [ "$NO_MERGE" = false ] && [ -n "$MAIN_BRANCH" ]; then
    echo -e "${YELLOW}🔄 切换到主分支...${NC}"
    git checkout "$MAIN_BRANCH" > /dev/null 2>&1
    echo -e "${GREEN}✓ 已切换到 $MAIN_BRANCH${NC}"
    
    echo -e "${YELLOW}⬇️  拉取最新代码...${NC}"
    git pull > /dev/null 2>&1
    echo -e "${GREEN}✓ 已拉取最新代码${NC}"
    echo ""
fi

# 完成
echo -e "${GREEN}✅ 任务完成！${NC}"
echo ""
echo "📝 Commit: $COMMIT_HASH"
if [ -n "$PR_NUMBER" ]; then
    echo "🔗 PR: #$PR_NUMBER"
    if [ "$NO_MERGE" = false ]; then
        echo "📍 状态: 已合并"
    else
        echo "📍 状态: 等待 review"
        echo ""
        echo -e "${BLUE}💡 下一步:${NC}"
        echo "  使用 ${YELLOW}bash scripts/task-sync-status.sh${NC} 检查状态"
    fi
fi
