const vscode = require("vscode");

// --- 1. 挂载 MathJax 全功能矢量渲染引擎 ---
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
		OutputJax: new SVG({ fontCache: "none" }), // 将字体矢量路径直接写入 SVG
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

// 动态匹配 VS Code 编辑器日夜主题的公式颜色
function getMathColor() {
	const kind = vscode.window.activeColorTheme.kind;
	if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
		return "#222222";
	}
	return "#E0E0E0";
}

// --- 2. 装饰器定义 ---

// 隐藏符号 (精准负字间距，不干扰字号计算)
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.5em",
});

// H1 标题：仅放大 1.35 倍 + 加粗，无背景，无下划线！
const h1Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.35em",
	fontWeight: "bold",
});

const h2Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.2em",
	fontWeight: "bold",
});

const h3Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.1em",
	fontWeight: "bold",
});

// 引用块：左侧灰线 + 缩进 + 斜体
const quoteDecoration = vscode.window.createTextEditorDecorationType({
	borderLeft: "3.5px solid rgba(128, 128, 128, 0.55)",
	paddingLeft: "8px",
	fontStyle: "italic",
});

// 无序列表：前缀自动转换为圆点 (•)
const listBulletDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "• ",
		fontWeight: "bold",
		color: "rgba(128, 128, 128, 0.85)",
	},
});

// 矢量 SVG 分割线
const svgHr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="2"><line x1="0" y1="1" x2="600" y2="1" stroke="gray" stroke-width="1.2" stroke-dasharray="5 3" opacity="0.5"/></svg>';
const hrDecoration = vscode.window.createTextEditorDecorationType({
	after: {
		contentIconPath: vscode.Uri.parse(svgHr),
		margin: "0 0 0 8px",
		verticalAlign: "middle",
	},
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through", opacity: "0.6" });
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
	fontFamily: "monospace",
});

function activate(context) {
	// MathJax SVG 句柄缓存池，彻底消除移动光标时的闪烁与卡顿
	const mathCache = new Map();

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();
		if (!["cpp", "c", "hpp", "h", "cc", "cxx"].includes(langId)) return;

		const activeLine = activeEditor.selection.active.line;

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

		let inBlockComment = false;

		for (let i = 0; i < doc.lineCount; i++) {
			const line = doc.lineAt(i);
			const text = line.text;
			const isCurrentLine = i === activeLine;

			let commentOffset = 0;
			let commentContent = "";
			let isCommentLine = false;

			// 解析单行 // 与多行 /* */ 注释
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
				const blockInnerMatch = text.match(/^(\s*\*+\/?\s*)(.*)$/);
				if (blockInnerMatch) {
					commentOffset = blockInnerMatch[1].length;
					commentContent = blockInnerMatch[2];
				} else {
					const indentMatch = text.match(/^(\s*)(.*)$/);
					commentOffset = indentMatch[1].length;
					commentContent = indentMatch[2];
				}

				if (text.includes("*/")) {
					inBlockComment = false;
					const endIdx = commentContent.indexOf("*/");
					if (endIdx !== -1) {
						commentContent = commentContent.substring(0, endIdx);
					}
				}
			}

			if (!isCommentLine || !commentContent) continue;

			// --- A. MathJax 数学公式 ($...$ 或 $$...$$) ---
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
						hideRanges.push(new vscode.Range(i, startIdx, i, endIdx));

						const isDisplay = fullMatch.startsWith("$$");
						const cacheKey = texExpr + "_" + isDisplay + "_" + getMathColor();

						if (!mathCache.has(cacheKey)) {
							try {
								const svgUri = texToSvg(texExpr, isDisplay, getMathColor());
								const deco = vscode.window.createTextEditorDecorationType({
									after: {
										contentIconPath: vscode.Uri.parse(svgUri),
										margin: "0 4px",
										verticalAlign: "middle",
									},
								});
								mathCache.set(cacheKey, deco);
							} catch (e) {
								console.error("[cpp-md] MathJax 渲染错误:", e);
							}
						}

						const mathDeco = mathCache.get(cacheKey);
						if (mathDeco) {
							activeEditor.setDecorations(mathDeco, [new vscode.Range(i, endIdx, i, endIdx)]);
						}
					}
				}
			}

			// --- B. 分割线 ---
			if (/^(---|[*]{3}|___)\s*$/.test(commentContent)) {
				hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				}
				continue;
			}

			// --- C. 标题 (非重叠精准 Range) ---
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

			// --- D. 引用 ---
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

			// --- F. 粗体/斜体/删除线/代码块 ---
			const strikeRegex = /~~(.*?)~~/g;
			let stm;
			while ((stm = strikeRegex.exec(commentContent)) !== null) {
				const startIdx = commentOffset + stm.index;
				const innerStart = startIdx + 2;
				const innerEnd = innerStart + stm[1].length;
				const endIdx = startIdx + stm[0].length;
				strikeRanges.push(new vscode.Range(i, innerStart, i, innerEnd));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, startIdx, i, innerStart));
					hideRanges.push(new vscode.Range(i, innerEnd, i, endIdx));
				}
			}

			const boldRegex = /\*\*(.*?)\*\*/g;
			let bm;
			while ((bm = boldRegex.exec(commentContent)) !== null) {
				const startIdx = commentOffset + bm.index;
				const innerStart = startIdx + 2;
				const innerEnd = innerStart + bm[1].length;
				const endIdx = startIdx + bm[0].length;
				boldRanges.push(new vscode.Range(i, innerStart, i, innerEnd));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, startIdx, i, innerStart));
					hideRanges.push(new vscode.Range(i, innerEnd, i, endIdx));
				}
			}

			const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
			let im;
			while ((im = italicRegex.exec(commentContent)) !== null) {
				const startIdx = commentOffset + im.index;
				const innerStart = startIdx + 1;
				const innerEnd = innerStart + im[1].length;
				const endIdx = startIdx + im[0].length;
				italicRanges.push(new vscode.Range(i, innerStart, i, innerEnd));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, startIdx, i, innerStart));
					hideRanges.push(new vscode.Range(i, innerEnd, i, endIdx));
				}
			}

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
		}

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
