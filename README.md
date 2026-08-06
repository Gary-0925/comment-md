# Markdown in C++

## 简介

这个 VScode 插件可以在 C++ 文件代码注释中渲染 Markdown 和 LaTeX/KaTeX。

目前 bug 比较多，正在持续开发中。

## 示例

您可以在安装扩展后将以下代码复制到 .cpp 文件中以查看渲染效果。

```cpp
#include <iostream>

/*
# 多行注释中的大标题

这是一个包含 **粗体**、*斜体* 以及 ~~删除线~~ 的多行 Markdown 注释。

> 这是一段引用说明

---

- 项目列表 1：支持 `int x = 100;` 内联代码
- 项目列表 2：支持行内公式 $n^2$

1. 由 AI 辅助编写
2. 支持多行公式

$$
\begin{aligned}
f(x) &= \int_0^x A^* (t) dt \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t}
\end{aligned}
$$
*/

void demoBlockComment()
{
	// # 单行注释大标题
	// > 单行引用说明
	// 这里有 ~~删除线文本~~ 和 *斜体文本*
}

int main()
{
	return 0;
}
```