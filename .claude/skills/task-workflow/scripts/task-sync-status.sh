#!/bin/bash
# task-sync-status.sh - 批量检查和清理已合并的 feature 分支
# 注：正常情况下 task-wrap-up.sh 会自动完成单个任务的合并和清理
# 此脚本用于批量检查多个分支状态或清理遗留分支

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
CHECK_ALL=false
CLEAN_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            CHECK_ALL=true
            shift
            ;;
        --clean)
            CLEAN_ALL=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo -e "${BLUE}📊 同步任务状态${NC}"
echo ""

# 获取主分支名
if git show-ref --verify --quiet refs/heads/main; then
    MAIN_BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    MAIN_BRANCH="master"
else
    MAIN_BRANCH=""
fi

# 函数：检查并清理单个分支
check_and_clean_branch() {
    local branch=$1
    local branch_clean=$2

    # 提取 Issue 号
    local issue=$(echo "$branch" | grep -oE '[0-9]+' | head -1)

    if [ -z "$issue" ]; then
        echo -e "${YELLOW}⚠️  $branch (无 Issue 号)${NC}"
        return
    fi

    # 查找对应的 PR
    if [ -n "$GH_CLI" ] && command -v "$GH_CLI" &> /dev/null; then
        local pr_info=$("$GH_CLI" pr list --head "$branch" --json number,state,title,mergedAt --jq '.[0] // {}' 2>/dev/null)

        local pr_number=$(echo "$pr_info" | grep -oE '"number":[0-9]+' | cut -d: -f2)
        local pr_state=$(echo "$pr_info" | grep -oE '"state":"[^"]+"' | cut -d: -f2 | tr -d '"')
        local pr_merged=$(echo "$pr_info" | grep -oE '"mergedAt":null' || echo "merged")

        if [ -z "$pr_number" ]; then
            echo -e "${YELLOW}○ $branch${NC} - ${BLUE}无 PR${NC}"
        elif [ "$pr_merged" != "merged" ]; then
            if [ "$pr_state" = "OPEN" ]; then
                echo -e "${GREEN}○ $branch${NC} - ${BLUE}PR #$pr_number (Open)${NC}"
            elif [ "$pr_state" = "MERGED" ]; then
                echo -e "${GREEN}✓ $branch${NC} - ${GREEN}PR #$pr_number (已合并)${NC}"

                # 清理分支
                if [ "$branch_clean" = "true" ]; then
                    echo "  → 删除本地分支..."
                    git branch -d "$branch" > /dev/null 2>&1 && echo -e "  ${GREEN}✓ 已删除本地${NC}" || echo -e "  ${YELLOW}⚠️  删除失败或有未合并更改${NC}"

                    # 删除远程分支
                    local remote_branch=$(git branch -r | grep "origin/$branch$" || echo "")
                    if [ -n "$remote_branch" ]; then
                        echo "  → 删除远程分支..."
                        git push origin --delete "$branch" > /dev/null 2>&1 && echo -e "  ${GREEN}✓ 已删除远程${NC}" || echo -e "  ${YELLOW}⚠️  删除远程失败${NC}"
                    fi
                fi
            fi
        else
            echo -e "${YELLOW}○ $branch${NC} - ${YELLOW}PR #$pr_number ($pr_state)${NC}"
        fi
    else
        echo -e "${YELLOW}○ $branch${NC} - ${YELLOW}(无法检查 PR 状态)${NC}"
    fi
}

# 获取当前分支
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CHECK_ALL" = false ]; then
    # 只检查当前分支
    echo -e "${YELLOW}📍 当前分支${NC}"
    echo "  $CURRENT_BRANCH"
    echo ""

    # 如果是 feature 分支，检查 PR 状态
    if [[ "$CURRENT_BRANCH" =~ ^(feat|fix|refactor|docs|perf)/ ]]; then
        echo -e "${YELLOW}🔗 PR 状态${NC}"
        check_and_clean_branch "$CURRENT_BRANCH" "false"
    else
        echo -e "${YELLOW}⚠️  当前不是 feature 分支${NC}"
    fi
else
    # 检查所有 feature 分支
    echo -e "${YELLOW}🌿 所有 Feature 分支${NC}"
    echo ""

    FEATURE_BRANCHES=$(git branch --list "feat/*" --list "fix/*" --list "refactor/*" --list "docs/*" --list "perf/*" 2>/dev/null)

    if [ -z "$FEATURE_BRANCHES" ]; then
        echo -e "${GREEN}(无 feature 分支)${NC}"
    else
        echo "$FEATURE_BRANCHES" | while read -r branch; do
            # 去掉 * 标记
            branch=${branch//\*/ }
            branch=${branch// /}
            check_and_clean_branch "$branch" "$CLEAN_ALL"
        done
    fi
fi

echo ""

# 切换到主分支
if [ -n "$MAIN_BRANCH" ] && [ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ] && [ "$CLEAN_ALL" = true ]; then
    echo -e "${YELLOW}🔄 切换到主分支...${NC}"
    git checkout "$MAIN_BRANCH" > /dev/null 2>&1
    echo -e "${GREEN}✓ 已切换到 $MAIN_BRANCH${NC}"
    echo ""

    # 拉取最新代码
    echo -e "${YELLOW}⬇️  拉取最新代码...${NC}"
    git pull > /dev/null 2>&1
    echo -e "${GREEN}✓ 已更新${NC}"
fi

echo ""
echo -e "${BLUE}💡 命令:${NC}"
echo "  检查当前分支: ${YELLOW}.tasks/workflows/task-sync-status.sh${NC}"
echo "  检查所有分支: ${YELLOW}.tasks/workflows/task-sync-status.sh --all${NC}"
echo "  清理已合并分支: ${YELLOW}.tasks/workflows/task-sync-status.sh --all --clean${NC}"
