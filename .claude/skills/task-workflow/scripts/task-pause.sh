#!/bin/bash
# task-pause.sh - 暂存当前任务

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
NO_SWITCH=false
SKIP_COMMENT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-switch)
            NO_SWITCH=true
            shift
            ;;
        --skip-comment)
            SKIP_COMMENT=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo -e "${BLUE}⏸️  暂存任务${NC}"
echo ""

# 获取当前分支
BRANCH=$(git branch --show-current)
ISSUE=$(echo "$BRANCH" | grep -oE '[0-9]+' | head -1)

echo -e "${YELLOW}📍 当前状态${NC}"
echo "  分支: $BRANCH"
if [ -n "$ISSUE" ]; then
    echo "  Issue: #$ISSUE"
fi

# 检查是否有更改
CHANGES=$(git status --porcelain 2>/dev/null)
if [ -z "$CHANGES" ]; then
    echo -e "${YELLOW}⚠️  没有未提交的更改${NC}"
    read -p "是否继续暂存? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
else
    echo ""
    echo "  更改:"
    echo "$CHANGES" | head -10 | sed 's/^/    /'
    if [ $(echo "$CHANGES" | wc -l) -gt 10 ]; then
        echo "    ... (更多)"
    fi
fi
echo ""

# Stash 更改
STASH_MSG="WIP on ${BRANCH}: $(date '+%Y-%m-%d %H:%M')"
echo -e "${YELLOW}💾 暂存更改...${NC}"
git stash push -u -m "$STASH_MSG" > /dev/null 2>&1 || {
    echo -e "${RED}❌ Stash 失败${NC}"
    exit 1
}

# 获取 stash ID
STASH_ID=$(git stash list | grep "$STASH_MSG" | head -1 | cut -d: -f1)
echo -e "${GREEN}✓ 已暂存: $STASH_ID${NC}"
echo ""

# 添加 Issue 评论（如果有 gh 和 Issue 号）
if [ "$SKIP_COMMENT" = false ] && [ -n "$GH_CLI" ] && [ -n "$ISSUE" ]; then
    if command -v "$GH_CLI" &> /dev/null; then
        echo -n "📝 记录进度到 Issue... "
        COMMENT_BODY="## ⏸️  进度暂存

暂存时间: $(date '+%Y-%m-%d %H:%M')
分支: \`$BRANCH\`

### 恢复命令
\`\`\`bash
git checkout $BRANCH
git stash pop
\`\`\`"

        if "$GH_CLI" issue comment "$ISSUE" --body "$COMMENT_BODY" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}⚠️ (跳过)${NC}"
        fi
    fi
fi

# 切换分支
if [ "$NO_SWITCH" = false ]; then
    echo ""
    echo -e "${YELLOW}🔄 切换分支...${NC}"

    # 尝试切换到 main，然后是 master
    if git show-ref --verify --quiet refs/heads/main; then
        git checkout main > /dev/null 2>&1
        echo -e "${GREEN}✓ 已切换到: main${NC}"
    elif git show-ref --verify --quiet refs/heads/master; then
        git checkout master > /dev/null 2>&1
        echo -e "${GREEN}✓ 已切换到: master${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到 main/master 分支${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ 任务已暂存${NC}"
echo ""
if [ -n "$STASH_ID" ]; then
    echo "💾 恢复命令: ${YELLOW}git checkout $BRANCH && git stash pop${NC}"
fi
echo ""
echo -e "${BLUE}💡 其他命令:${NC}"
echo "  查看所有暂存: ${YELLOW}git stash list${NC}"
echo "  恢复任务: ${YELLOW}.tasks/workflows/task-resume.sh $ISSUE${NC}"
