const vscode = require("vscode");

// --- 1. MathJax 全功能矢量渲染引擎 ---
let texToSvg = null;
try {
	const { mathjax } = require("mathjax-full/js/mathjax.js");
	const { TeX } = require("mathjax-full/js/input/tex.js");
	const { SVG } = require("mathjax-full/js/output/svg.js");
	const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
	const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
	const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");

	const adaptor = liteAdaptor();
	RegisterHTMLHandler(adaptor);

	const htmlDoc = mathjax.document("", {
		InputJax: new TeX({ packages: AllPackages }),
		OutputJax: new SVG({ fontCache: "none" }),
	});

	texToSvg = function (tex, isDisplay, color) {
		const node = htmlDoc.convert(tex, { display: isDisplay });
		let svgStr = adaptor.innerHTML(node);
		svgStr = svgStr.replace(/currentColor/g, color);
		return "data:image/svg+xml;utf8," + encodeURIComponent(svgStr);
	};
} catch (e) {
	console.error("[cpp-md] MathJax 引擎加载失败:", e);
}

function getMathColor() {
	const kind = vscode.window.activeColorTheme.kind;
	if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
		return "#222222";
	}
	return "#E0E0E0";
}

// --- 2. 装饰器定义 ---

// 基础隐藏样式
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.5em",
});

// 【核心修复】：公式专用零宽度折叠样式（防止行内公式推挤上下文文本导致错位）
const hideMathTextDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	fontSize: "0px",
	letterSpacing: "-1em",
});

// H1 标题：仅放大 1.35 倍 + 加粗 (干净纯粹，无背景，无下划线)
const h1Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.35em", fontWeight: "bold" });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.2em", fontWeight: "bold" });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.1em", fontWeight: "bold" });

// 引用块：100% 稳定显示的灰线
const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: " ",
		borderLeft: "3.5px solid rgba(128, 128, 128, 0.65)",
		margin: "0 6px 0 0",
	},
	fontStyle: "italic",
});

// 分割线 (---)：原生整行虚线，绝不出横向滚动条
const hrDecoration = vscode.window.createTextEditorDecorationType({
	borderBottom: "1px dashed rgba(128, 128, 128, 0.45)",
	isWholeLine: true,
});

// 无序列表：前缀自动转换为圆点 (•)
const listBulletDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "• ",
		fontWeight: "bold",
		color: "rgba(128, 128, 128, 0.85)",
	},
});

// 原子级文本样式
const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through", opacity: "0.65" });
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
	fontFamily: "monospace",
});

// 全局句柄，每次刷新彻底销毁旧的公式，防止在右侧重复堆叠
let activeMathDecorations = [];

function activate(context) {
	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();
		if (!["cpp", "c", "hpp", "h", "cc", "cxx"].includes(langId)) return;

		const activeLine = activeEditor.selection.active.line;

		// 彻底清理销毁上一帧的所有公式句柄
		activeMathDecorations.forEach((d) => d.dispose());
		activeMathDecorations = [];

		const h1Ranges = [],
			h2Ranges = [],
			h3Ranges = [];
		const boldRanges = [],
			italicRanges = [],
			strikeRanges = [];
		const codeRanges = [],
			quoteRanges = [],
			hrRanges = [],
			listBulletRanges = [];
		const hideRanges = [];
		const hideMathRanges = [];

		// 遍历提取注释块
		let inBlockComment = false;

		for (let i = 0; i < doc.lineCount; i++) {
			const line = doc.lineAt(i);
			const text = line.text;
			const isCurrentLine = i === activeLine;

			let commentOffset = 0;
			let commentContent = "";
			let isCommentLine = false;

			if (!inBlockComment) {
				const singleMatch = text.match(/^(\s*\/\/\/?\s*)(.*)$/);
				const blockStartMatch = text.match(/^(\s*\/\*+\s*)(.*)$/);

				if (singleMatch) {
					isCommentLine = true;
					commentOffset = singleMatch[1].length;
					commentContent = singleMatch[2];
				} else if (blockStartMatch) {
					isCommentLine = true;
					commentOffset = blockStartMatch[1].length;
					commentContent = blockStartMatch[2];
					inBlockComment = true;

					if (commentContent.includes("*/")) {
						inBlockComment = false;
						commentContent = commentContent.substring(0, commentContent.indexOf("*/"));
					}
				}
			} else {
				isCommentLine = true;
				commentOffset = text.search(/\S|$/);
				commentContent = text.trim();

				if (text.includes("*/")) {
					inBlockComment = false;
					const endIdx = commentContent.indexOf("*/");
					if (endIdx !== -1) {
						commentContent = commentContent.substring(0, endIdx);
					}
				}
			}

			if (!isCommentLine || !commentContent) continue;

			// --- A. 单行 MathJax 公式 ($...$ 或 $$...$$) ---
			if (texToSvg) {
				const mathRegex = /(\$\$|\$)(.*?)\1/g;
				let mm;
				while ((mm = mathRegex.exec(commentContent)) !== null) {
					const fullMatch = mm[0];
					const texExpr = mm[2];
					if (!texExpr.trim()) continue;

					const startIdx = commentOffset + mm.index;
					const endIdx = startIdx + fullMatch.length;

					if (!isCurrentLine) {
						// 使用零宽度折叠样式隐藏原生的 $tex$ 源码
						hideMathRanges.push(new vscode.Range(i, startIdx, i, endIdx));

						try {
							const isDisplay = fullMatch.startsWith("$$");
							const svgUri = texToSvg(texExpr, isDisplay, getMathColor());
							const mathDeco = vscode.window.createTextEditorDecorationType({
								after: {
									contentIconPath: vscode.Uri.parse(svgUri),
									margin: "0 2px",
									verticalAlign: "middle",
								},
							});
							activeEditor.setDecorations(mathDeco, [new vscode.Range(i, endIdx, i, endIdx)]);
							activeMathDecorations.push(mathDeco);
						} catch (e) {
							console.error("[cpp-md] MathJax 渲染错误:", e);
						}
					}
				}
			}

			// --- B. 分割线 (--- 或 ***) ---
			if (/^(---|[*]{3}|___)\s*$/.test(commentContent)) {
				hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				}
				continue;
			}

			// --- C. 标题 (#, ##, ###) ---
			const headerMatch = commentContent.match(/^(#+)\s+(.*)$/);
			if (headerMatch) {
				const hashLen = headerMatch[1].length;
				const textStartIdx = commentOffset + hashLen + 1;

				const textRange = new vscode.Range(i, textStartIdx, i, text.length);
				if (hashLen === 1) h1Ranges.push(textRange);
				else if (hashLen === 2) h2Ranges.push(textRange);
				else h3Ranges.push(textRange);

				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
				continue;
			}

			// --- D. 引用 (> quote) ---
			const quoteMatch = commentContent.match(/^(>\s*)(.*)$/);
			if (quoteMatch) {
				const quotePrefixLen = quoteMatch[1].length;
				const textStartIdx = commentOffset + quotePrefixLen;

				quoteRanges.push(new vscode.Range(i, textStartIdx, i, text.length));

				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
			}

			// --- E. 无序列表 (- 或 *) ---
			const listMatch = commentContent.match(/^([-*])\s+(.*)$/);
			if (listMatch && !quoteMatch) {
				const prefixLen = 2;
				const textStartIdx = commentOffset + prefixLen;

				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
					listBulletRanges.push(new vscode.Range(i, textStartIdx, i, textStartIdx));
				}
			}

			// --- F. 行内代码 (`code`) ---
			const codeRegex = /`(.*?)`/g;
			let cm;
			while ((cm = codeRegex.exec(commentContent)) !== null) {
				const startIdx = commentOffset + cm.index;
				const innerStart = startIdx + 1;
				const innerEnd = innerStart + cm[1].length;
				const endIdx = startIdx + cm[0].length;

				codeRanges.push(new vscode.Range(i, innerStart, i, innerEnd));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, startIdx, i, innerStart));
					hideRanges.push(new vscode.Range(i, innerEnd, i, endIdx));
				}
			}

			// --- G. 递归解析组合嵌套样式 ---
			function parseInlineFormatting(str, strOffset, currentStyles) {
				if (!str) return;

				const candidates = [];

				const strikeRegex = /~~([\s\S]+?)~~/g;
				let m = strikeRegex.exec(str);
				if (m) candidates.push({ index: m.index, fullLen: m[0].length, inner: m[1], delimLen: 2, type: "strike" });

				const boldItalicRegex = /\*{3}([\s\S]+?)\*{3}/g;
				m = boldItalicRegex.exec(str);
				if (m) candidates.push({ index: m.index, fullLen: m[0].length, inner: m[1], delimLen: 3, type: "boldItalic" });

				const boldRegex = /(?<!\*)\*{2}([^*][\s\S]*?)\*{2}(?!\*)/g;
				m = boldRegex.exec(str);
				if (m) candidates.push({ index: m.index, fullLen: m[0].length, inner: m[1], delimLen: 2, type: "bold" });

				const italicRegex = /(?<!\*)\*([^*]+?)\*(?!\*)/g;
				m = italicRegex.exec(str);
				if (m) candidates.push({ index: m.index, fullLen: m[0].length, inner: m[1], delimLen: 1, type: "italic" });

				if (candidates.length === 0) {
					if (str.length > 0) {
						const range = new vscode.Range(i, strOffset, i, strOffset + str.length);
						if (currentStyles.bold) boldRanges.push(range);
						if (currentStyles.italic) italicRanges.push(range);
						if (currentStyles.strike) strikeRanges.push(range);
					}
					return;
				}

				candidates.sort((a, b) => a.index - b.index);
				const best = candidates[0];

				if (best.index > 0) {
					const prefixText = str.substring(0, best.index);
					const prefixRange = new vscode.Range(i, strOffset, i, strOffset + prefixText.length);
					if (currentStyles.bold) boldRanges.push(prefixRange);
					if (currentStyles.italic) italicRanges.push(prefixRange);
					if (currentStyles.strike) strikeRanges.push(prefixRange);
				}

				const openStart = strOffset + best.index;
				const openEnd = openStart + best.delimLen;
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, openStart, i, openEnd));
				}

				const innerOffset = openEnd;
				const nextStyles = {
					bold: currentStyles.bold || best.type === "bold" || best.type === "boldItalic",
					italic: currentStyles.italic || best.type === "italic" || best.type === "boldItalic",
					strike: currentStyles.strike || best.type === "strike",
				};
				parseInlineFormatting(best.inner, innerOffset, nextStyles);

				const closeStart = innerOffset + best.inner.length;
				const closeEnd = closeStart + best.delimLen;
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, closeStart, i, closeEnd));
				}

				const remainderStart = best.index + best.fullLen;
				const remainderText = str.substring(remainderStart);
				parseInlineFormatting(remainderText, strOffset + remainderStart, currentStyles);
			}

			parseInlineFormatting(commentContent, commentOffset, { bold: false, italic: false, strike: false });
		}

		// --- H. 全局多行跨行公式 ($$ ... $$) 解析引擎 ---
		if (texToSvg) {
			const fullText = doc.getText();
			const multilineMathRegex = /\$\$([\s\S]+?)\$\$/g;
			let match;

			while ((match = multilineMathRegex.exec(fullText)) !== null) {
				const rawTex = match[1].trim();
				if (!rawTex) continue;

				const startPos = doc.positionAt(match.index);
				const endPos = doc.positionAt(match.index + match[0].length);

				// 判断光标是否落在多行公式所在的任意一行中
				const isCursorInFormula = activeLine >= startPos.line && activeLine <= endPos.line;

				if (!isCursorInFormula) {
					// 折叠多行源码
					hideMathRanges.push(new vscode.Range(startPos, endPos));

					try {
						const svgUri = texToSvg(rawTex, true, getMathColor());
						const mathDeco = vscode.window.createTextEditorDecorationType({
							after: {
								contentIconPath: vscode.Uri.parse(svgUri),
								margin: "6px 0",
								verticalAlign: "middle",
							},
						});
						activeEditor.setDecorations(mathDeco, [new vscode.Range(endPos, endPos)]);
						activeMathDecorations.push(mathDeco);
					} catch (e) {
						console.error("[cpp-md] 多行 MathJax 渲染错误:", e);
					}
				}
			}
		}

		// 应用各类样式
		activeEditor.setDecorations(h1Decoration, h1Ranges);
		activeEditor.setDecorations(h2Decoration, h2Ranges);
		activeEditor.setDecorations(h3Decoration, h3Ranges);
		activeEditor.setDecorations(boldDecoration, boldRanges);
		activeEditor.setDecorations(italicDecoration, italicRanges);
		activeEditor.setDecorations(strikethroughDecoration, strikeRanges);
		activeEditor.setDecorations(codeDecoration, codeRanges);
		activeEditor.setDecorations(quoteDecoration, quoteRanges);
		activeEditor.setDecorations(hrDecoration, hrRanges);
		activeEditor.setDecorations(listBulletDecoration, listBulletRanges);
		activeEditor.setDecorations(hideDecoration, hideRanges);
		activeEditor.setDecorations(hideMathTextDecoration, hideMathRanges);
	}

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(updateDecorations),
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
				updateDecorations();
			}
		}),
		vscode.window.onDidChangeTextEditorSelection(updateDecorations),
	);

	updateDecorations();
}

function deactivate() {}

module.exports = { activate, deactivate };
