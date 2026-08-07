<p align="center">
	<img src="./icon.png" alt="icon" height="100px" width="100px"></img>
</p>

<h1 align="center">Markdown in Comments</h1>

[![latest version](https://img.shields.io/github/v/release/Gary-0925/comment-md?sort=date&style=flat-square&label=latest%20version&color=%23aa99dd)](https://github.com/Gary-0925/comment-md/releases/latest)[![latest version](https://img.shields.io/github/release-date/Gary-0925/comment-md?style=flat-square&label=%20&color=%23aa99dd)](https://github.com/Gary-0925/comment-md/releases/latest)
[![latest update](https://img.shields.io/github/last-commit/Gary-0925/comment-md?style=flat-square&label=latest%20update)](https://github.com/Gary-0925/comment-md/commit/main)
[![license](https://img.shields.io/github/license/Gary-0925/comment-md.svg?style=flat-square)](https://github.com/Gary-0925/comment-md/blob/main/LICENSE)

## 简介

这个 VScode 插件可以在代码注释中渲染 Markdown 和 LaTeX，支持部分 Markdown 语法和多行公式。

目前支持 C++、C、C#、Python、Java、Rust、Go、JS、PHP、TS、Kotlin、Swift 等编程语言，可以在设置中调整对每种语言是否启用。

由 Gemini-3.6-flash 辅助编写，目前 Bug 比较多，正在持续开发中。

**这个插件不是 Markdown 编辑器，它的目的是营造更美观的注释，而不是把注释变成 Markdown 编辑器。**

## 示例

您可以在安装扩展后将以下代码保存为 .cpp 文件中以查看渲染效果。

```cpp
#include <iostream>

/*
# 多行注释大标题

这是一个包含 **粗体**、*斜体* 以及 ~~删除线~~ 的多行 Markdown 注释。

> 这是一段引用

下面是分割线

---

- 项目列表 1：支持 `int x = 100;` 内联代码
- 项目列表 2：支持行内公式 $n^2$

1. 即时预览
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
	// > 单行引用
	// ~~删除线文本~~ 和 *斜体文本*
}

int main()
{
	return 0;
}
```
