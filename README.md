# Markdown in C++

## 简介

这个 VScode 插件可以在 C++（.cpp & .hpp & .h）代码注释中渲染 Markdown。

## 示例

您可以在安装扩展后将以下代码复制到 .cpp 文件中以查看渲染效果。

```cpp
#include <iostream>

/*
# 1. 多行注释中的大标题

这是一个包含 **粗体**、*斜体* 以及 ~~删除线~~ 的多行 Markdown 注释。

> 这是一段引用说明

---

- 项目列表 1：支持 `int x = 100;` 内联代码
- 项目列表 2：更多功能正在添加

1. 由 AI 辅助编写
2. 持续更新中
*/
void demoBlockComment()
{
    // # 2. 单行注释大标题
    // > 单行引用说明
    // 这里有 ~~删除线文本~~ 和 *斜体文本*
}

int main()
{
    return 0;
}
```