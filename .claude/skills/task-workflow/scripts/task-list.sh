#!/bin/bash
# task-list.sh - 列出任务状态

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取 gh CLI 路径
GH_CLI="${GH_CLI:-gh}"
if ! command -v "$GH_CLI" &> /dev/null; then
    # 尝试常见路径
    if [ -f "/c/Program Files/GitHub CLI/gh.exe" ]; then
        GH_CLI="/c/Program Files/GitHub CLI/gh.exe"
    elif [ -f "/mnt/c/Program Files/GitHub CLI/gh.exe" ]; then
        GH_CLI="/mnt/c/Program Files/GitHub CLI/gh.exe"
    else
        echo "错误: 找不到 gh CLI，请先安装并登录"
        exit 1
    fi
fi

echo -e "${BLUE}📋 任务概览${NC}"
echo ""

# 当前工作
echo -e "${YELLOW}🔧 当前工作${NC}"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo -e "  分支: ${GREEN}$CURRENT_BRANCH${NC}"

# 统计更改
if command -v git &> /dev/null; then
    CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  未提交更改: $CHANGES 个文件"
fi

echo ""

# Open Issues
echo -e "${YELLOW}📌 Open Issues${NC}"
ISSUES=$("$GH_CLI" issue list --state open --limit 20 2>/dev/null || echo "")
if [ -z "$ISSUES" ]; then
    echo -e "  ${GREEN}(无 open issues)${NC}"
else
    echo "$ISSUES" | while read -r line; do
        echo "  $line"
    done
fi

echo ""

# Feature 分支
echo -e "${YELLOW}🌿 本地 Feature 分支${NC}"
FEATURE_BRANCHES=$(git branch --list "feat/*" --list "fix/*" --list "refactor/*" --list "docs/*" --list "perf/*" 2>/dev/null || echo "")
if [ -z "$FEATURE_BRANCHES" ]; then
    echo -e "  ${GREEN}(无 feature 分支)${NC}"
else
    echo "$FEATURE_BRANCHES" | while read -r branch; do
        if [[ "$branch" == *"*"* ]]; then
            current=" (当前)"
            branch=${branch//\*/ }
        else
            current=""
        fi
        echo "  ${branch}${current}"
    done
fi

echo ""

# Open PRs
echo -e "${YELLOW}📤 Open PRs${NC}"
PRS=$("$GH_CLI" pr list --state open --limit 10 2>/dev/null || echo "")
if [ -z "$PRS" ]; then
    echo -e "  ${GREEN}(无 open PRs)${NC}"
else
    echo "$PRS" | while read -r line; do
        echo "  $line"
    done
fi

echo ""
echo -e "${BLUE}💡 可用命令:${NC}"
echo "  /task-start <描述>  - 开始新任务"
echo "  /task-wrap-up      - 完成并提交任务"
echo "  /task-pause        - 暂存当前任务"
echo "  /task-resume <#>   - 恢复任务"
echo "  /task-sync-status  - 同步合并状态"
