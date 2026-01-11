#!/bin/bash
# task-start.sh - 开始新任务

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
TASK_DESCRIPTION="$1"
MILESTONE="${2:-}"
LABELS="${3:-}"

# 使用说明
if [ -z "$TASK_DESCRIPTION" ]; then
    echo -e "${RED}用法: $0 <任务描述> [milestone] [labels]${NC}"
    echo ""
    echo "示例:"
    echo "  $0 \"添加敌人受击动画\""
    echo "  $0 \"修复碰撞 bug\" \"\" \"bug,fix\""
    echo "  $0 \"实现武器升级\" \"phase-2\" \"enhancement\""
    exit 1
fi

echo -e "${BLUE}🚀 开始新任务${NC}"
echo ""

# 判断任务类型
TYPE="feat"
LABEL="enhancement"

if [[ "$TASK_DESCRIPTION" =~ ^fix: ]] || [[ "$TASK_DESCRIPTION" =~ 修复|bug|错误 ]]; then
    TYPE="fix"
    LABEL="bug"
elif [[ "$TASK_DESCRIPTION" =~ ^refactor: ]] || [[ "$TASK_DESCRIPTION" =~ 重构 ]]; then
    TYPE="refactor"
    LABEL="refactor"
elif [[ "$TASK_DESCRIPTION" =~ ^docs: ]] || [[ "$TASK_DESCRIPTION" =~ 文档 ]]; then
    TYPE="docs"
    LABEL="documentation"
elif [[ "$TASK_DESCRIPTION" =~ ^perf: ]] || [[ "$TASK_DESCRIPTION" =~ 优化|性能 ]]; then
    TYPE="perf"
    LABEL="performance"
fi

# 合并标签
if [ -n "$LABELS" ]; then
    LABEL="$LABEL,$LABELS"
fi

# 清理描述（去除类型前缀）
CLEAN_DESC=$(echo "$TASK_DESCRIPTION" | sed 's/^[a-z]*://')
CLEAN_DESC=$(echo "$CLEAN_DESC" | sed 's/^[[:space:]]*//')

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo -e "${YELLOW}⚠️  警告: 有未提交的更改${NC}"
    git status --short
    echo ""
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建 Issue
echo -e "${YELLOW}📝 创建 Issue...${NC}"

ISSUE_BODY="## 描述
$CLEAN_DESC

## 验收标准
- [ ] 功能正常工作
- [ ] 通过测试验证
- [ ] 代码符合规范

---
创建于: $(date '+%Y-%m-%d %H:%M')"

# 构建 gh 命令
GH_CMD="$GH_CLI issue create --title \"$CLEAN_DESC\" --body \"$ISSUE_BODY\" --label \"$LABEL\""

if [ -n "$MILESTONE" ]; then
    GH_CMD="$GH_CMD --milestone \"$MILESTONE\""
fi

# 执行创建
ISSUE_OUTPUT=$(eval "$GH_CMD 2>&1")

# 提取 Issue URL 和编号
ISSUE_URL=$(echo "$ISSUE_OUTPUT" | grep -oE 'https://github.com/[^[:space:]]+' | head -1)
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$' | head -1)

if [ -z "$ISSUE_NUMBER" ]; then
    echo -e "${RED}❌ 创建 Issue 失败${NC}"
    echo "$ISSUE_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✓ Issue #$ISSUE_NUMBER 已创建${NC}"
echo "  $ISSUE_URL"
echo ""

# 生成分支名
# 将中文/空格转换为 kebab-case
BRANCH_SUFFIX=$(echo "$CLEAN_DESC" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || echo "$CLEAN_DESC")
BRANCH_SUFFIX=$(echo "$BRANCH_SUFFIX" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--\+/-/g' | sed 's/^-//' | sed 's/-$//')
BRANCH_NAME="$TYPE/$ISSUE_NUMBER-${BRANCH_SUFFIX}"

# 创建并切换分支
echo -e "${YELLOW}🌿 创建分支...${NC}"
git checkout -b "$BRANCH_NAME" 2>/dev/null || {
    echo -e "${RED}❌ 创建分支失败${NC}"
    exit 1
}

echo -e "${GREEN}✓ 已切换到分支: $BRANCH_NAME${NC}"
echo ""

# 创建测试骨架文件
echo -e "${YELLOW}📝 创建测试骨架...${NC}"

# 根据类型确定测试目录和后缀
case $TYPE in
    feat|fix)
        TEST_DIR="tests/features"
        TEST_SUFFIX=".feature.ts"
        ;;
    *)
        TEST_DIR="tests/features"
        TEST_SUFFIX=".feature.ts"
        ;;
esac

# 生成测试文件名（使用 kebab-case）
TEST_FILENAME="${BRANCH_SUFFIX}${TEST_SUFFIX}"
TEST_FILE="$TEST_DIR/$TEST_FILENAME"

# 创建目录
mkdir -p "$TEST_DIR"

# 创建测试骨架文件
cat > "$TEST_FILE" << TESTEOF
/**
 * @description 功能测试: $CLEAN_DESC
 * @issue #$ISSUE_NUMBER
 */
import { describe, it, expect } from 'vitest';

describe('$CLEAN_DESC', () => {
  it.todo('should implement test cases for this feature');

  // 示例测试结构:
  // describe('核心功能', () => {
  //   it('应该正确处理正常情况', () => {
  //     expect(true).toBe(true);
  //   });
  //
  //   it('应该正确处理边界情况', () => {
  //     expect(true).toBe(true);
  //   });
  // });
});
TESTEOF

echo -e "${GREEN}✓ 已创建测试骨架: $TEST_FILE${NC}"
echo -e "${BLUE}💡 提示: 请在实现功能的同时完善测试用例${NC}"
echo ""

# 创建初始空提交（可选）
read -p "是否创建初始空提交? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit --allow-empty -m "chore(#$ISSUE_NUMBER): start work on $CLEAN_DESC" > /dev/null 2>&1
    git push -u origin HEAD > /dev/null 2>&1
    echo -e "${GREEN}✓ 已推送初始提交${NC}"
    echo ""
fi

# 输出摘要
echo -e "${GREEN}✅ 任务已创建${NC}"
echo ""
echo -e "📋 Issue: ${BLUE}#$ISSUE_NUMBER${NC} - $CLEAN_DESC"
echo "   $ISSUE_URL"
echo ""
echo -e "🏷️  Labels: $LABEL"
if [ -n "$MILESTONE" ]; then
    echo -e "🎯 Milestone: $MILESTONE"
fi
echo ""
echo -e "🌿 Branch: ${GREEN}$BRANCH_NAME${NC}"
echo ""
echo -e "${BLUE}💡 下一步:${NC}"
echo "  1. 开始编码"
echo "  2. 完成后运行: ${YELLOW}.tasks/workflows/task-wrap-up.sh${NC}"
echo "  3. 或查看任务: ${YELLOW}.tasks/workflows/task-list.sh${NC}"
