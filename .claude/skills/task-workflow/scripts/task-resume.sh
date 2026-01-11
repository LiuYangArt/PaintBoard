#!/bin/bash
# task-resume.sh - 恢复暂存的任务

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
    fi
fi

# 解析参数
LIST_ONLY=false
ISSUE_NUMBER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --list|-l)
            LIST_ONLY=true
            shift
            ;;
        --last)
            # 获取最新的 stash
            LAST_STASH=$(git stash list | head -1)
            ISSUE_NUMBER=$(echo "$LAST_STASH" | grep -oE '[0-9]+' | head -1)
            shift
            ;;
        *)
            ISSUE_NUMBER="$1"
            shift
            ;;
    esac
done

echo -e "${BLUE}▶️  恢复任务${NC}"
echo ""

# 列出可恢复的任务
if [ "$LIST_ONLY" = true ]; then
    echo -e "${YELLOW}📋 可恢复的任务${NC}"
    echo ""

    git stash list | while read -r stash; do
        echo "  $stash"
    done

    echo ""
    echo "使用: $0 <issue-number>"
    exit 0
fi

# 如果没有指定 Issue，列出可用的
if [ -z "$ISSUE_NUMBER" ]; then
    echo -e "${YELLOW}📋 请选择要恢复的任务${NC}"
    echo ""

    # 查找所有 stash 并尝试提取 Issue 号
    FOUND_ISSUES=()
    git stash list | while read -r stash; do
        ISSUE=$(echo "$stash" | grep -oE '[0-9]+' | head -1)
        if [ -n "$ISSUE" ]; then
            FOUND_ISSUES+=("$ISSUE")
            BRANCH=$(echo "$stash" | grep -oE 'On [^:]*' | cut -d' ' -f2)
            echo "  Issue #$ISSUE - $BRANCH"
            echo "    $stash"
        fi
    done

    echo ""
    echo "使用: $0 <issue-number>"
    echo "示例: $0 42"
    exit 0
fi

# 查找对应分支
POSSIBLE_BRANCHES=$(git branch --list "*/$ISSUE_NUMBER-*" --list "*/$ISSUE_NUMBER")

if [ -z "$POSSIBLE_BRANCHES" ]; then
    echo -e "${RED}❌ 找不到 Issue #$ISSUE_NUMBER 对应的分支${NC}"
    echo ""
    echo "可用的 feature 分支:"
    git branch --list "feat/*" --list "fix/*" | sed 's/^/  /'
    exit 1
fi

# 选择第一个匹配的分支
BRANCH=$(echo "$POSSIBLE_BRANCHES" | head -1 | tr -d ' ')

echo -e "${YELLOW}🔍 找到分支: $BRANCH${NC}"
echo ""

# 检查当前分支
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
    echo -e "${YELLOW}🔄 切换到分支...${NC}"
    git checkout "$BRANCH" > /dev/null 2>&1 || {
        echo -e "${RED}❌ 切换分支失败${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ 已切换到: $BRANCH${NC}"
fi
echo ""

# 查找对应的 stash
echo -e "${YELLOW}💾 查找暂存...${NC}"
STASH_ID=$(git stash list | grep "#$ISSUE_NUMBER" | head -1 | cut -d: -f1)

if [ -z "$STASH_ID" ]; then
    # 尝试按分支名查找
    STASH_ID=$(git stash list | grep "$BRANCH" | head -1 | cut -d: -f1)
fi

if [ -z "$STASH_ID" ]; then
    echo -e "${YELLOW}⚠️  没有找到对应的 stash${NC}"
    echo ""
    echo "所有 stash:"
    git stash list | sed 's/^/  /'
else
    echo -e "${GREEN}✓ 找到: $STASH_ID${NC}"
    echo ""

    # 恢复 stash
    echo -e "${YELLOW}📥 恢复暂存的更改...${NC}"
    git stash pop "$STASH_ID" > /dev/null 2>&1 || {
        echo -e "${RED}❌ 恢复 stash 失败（可能有冲突）${NC}"
        echo "请手动解决冲突后继续"
        exit 1
    }
    echo -e "${GREEN}✓ 已恢复更改${NC}"
fi

echo ""

# 获取 Issue 详情（如果有 gh）
if [ -n "$GH_CLI" ] && command -v "$GH_CLI" &> /dev/null; then
    echo -e "${YELLOW}📋 任务详情${NC}"
    "$GH_CLI" issue view "$ISSUE_NUMBER" 2>/dev/null || true
fi

# 显示当前更改
echo ""
echo -e "${YELLOW}📂 当前更改${NC}"
git status --short
echo ""

echo -e "${GREEN}✅ 任务已恢复${NC}"
echo ""
echo -e "${BLUE}💡 下一步:${NC}"
echo "  1. 继续编码"
echo "  2. 完成后运行: ${YELLOW}.tasks/workflows/task-wrap-up.sh${NC}"
