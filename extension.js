const vscode = require("vscode");

// --- 1. 初始化 MathJax 矢量引擎 ---
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
		// fontCache: 'none' 将所有矢量字体线条直接嵌入 SVG，确保 100% 独立渲染
		OutputJax: new SVG({ fontCache: "none" }),
	});

	texToSvg = function (tex, isDisplay = false, color = "#E0E0E0") {
		const node = htmlDoc.convert(tex, { display: isDisplay });
		let svgStr = adaptor.innerHTML(node);
		// 将公式颜色替换为适配当前编辑器主题的颜色
		svgStr = svgStr.replace(/currentColor/g, color);
		return "data:image/svg+xml;utf8," + encodeURIComponent(svgStr);
	};
} catch (e) {
	console.error("[cpp-md] MathJax 初始化失败:", e);
}

// 获取当前 VS Code 主题对应的公式颜色（亮色主题用黑色，暗色主题用亮灰）
function getMathColor() {
	const kind = vscode.window.activeColorTheme.kind;
	if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
		return "#222222";
	}
	return "#E0E0E0";
}

// --- 2. 装饰器定义 ---
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.5em",
});

// H1 使用 22px 绝对大字号 + 底部粗分割线
const h1Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "22px",
	fontWeight: "bold",
	borderBottom: "2px solid rgba(128, 128, 128, 0.4)",
});

const h2Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "17px",
	fontWeight: "bold",
});

const h3Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "15px",
	fontWeight: "bold",
});

// 引用块使用 ThemeColor 自动适应 C++ 注释主题色
const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "▌ ",
		color: new vscode.ThemeColor("comment"),
	},
	fontStyle: "italic",
});

// 矢量 SVG 虚线分割线
const svgHr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="4"><line x1="0" y1="2" x2="800" y2="2" stroke="gray" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.45"/></svg>';
const hrDecoration = vscode.window.createTextEditorDecorationType({
	after: {
		contentIconPath: vscode.Uri.parse(svgHr),
		margin: "0 0 0 10px",
	},
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through", opacity: "0.6" });
const listDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
	fontFamily: "monospace",
});

function activate(context) {
	let mathDecorations = [];

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();
		if (!["cpp", "c", "hpp", "h", "cc", "cxx"].includes(langId)) return;

		const activeLine = activeEditor.selection.active.line;

		// 清理上一次的数学公式句柄
		mathDecorations.forEach((d) => d.dispose());
		mathDecorations = [];

		const h1Ranges = [],
			h2Ranges = [],
			h3Ranges = [];
		const boldRanges = [],
			italicRanges = [],
			strikeRanges = [];
		const codeRanges = [],
			quoteRanges = [],
			hrRanges = [],
			listRanges = [];
		const hideRanges = [];

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

						try {
							const isDisplay = fullMatch.startsWith("$$");
							const svgUri = texToSvg(texExpr, isDisplay, getMathColor());
							const mathDeco = vscode.window.createTextEditorDecorationType({
								after: {
									contentIconPath: vscode.Uri.parse(svgUri),
									verticalAlign: "middle",
									margin: "0 4px",
								},
							});
							activeEditor.setDecorations(mathDeco, [new vscode.Range(i, endIdx, i, endIdx)]);
							mathDecorations.push(mathDeco);
						} catch (err) {
							console.error("[cpp-md] MathJax 渲染公式出错:", err);
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

			// --- C. 标题 ---
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

			// --- E. 列表 ---
			const listMatch = commentContent.match(/^((?:[-*]|\d+\.)\s+)/);
			if (listMatch && !quoteMatch) {
				const listPrefixLen = listMatch[1].length;
				listRanges.push(new vscode.Range(i, commentOffset, i, commentOffset + listPrefixLen));
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
		activeEditor.setDecorations(listDecoration, listRanges);
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
