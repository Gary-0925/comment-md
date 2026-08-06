const vscode = require("vscode");

// 1. 隐藏符号黑科技：透明色 + 负字间距 (绝不干扰 VS Code 行高和字体放大计算)
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.5em",
});

// 2. 标题样式：保持原生注释颜色，真正放大 1.4 倍 + 加粗 + 分割线
const h1Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.4em",
	fontWeight: "bold",
	borderBottom: "2px solid rgba(128, 128, 128, 0.35)",
});

const h2Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.2em",
	fontWeight: "bold",
});

const h3Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.1em",
	fontWeight: "bold",
});

// 3. 引用块 (> quote)：竖线颜色 100% 动态跟随当前主题的注释颜色 (ThemeColor)
const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "▌ ",
		color: new vscode.ThemeColor("comment"), // 原生注释调色盘
	},
	fontStyle: "italic",
});

// 4. 水平分割线 (---)：采用 100% 矢量 SVG 画布，平滑高级
const svgHr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="4"><line x1="0" y1="2" x2="800" y2="2" stroke="gray" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.45"/></svg>';
const hrDecoration = vscode.window.createTextEditorDecorationType({
	after: {
		contentIconPath: vscode.Uri.parse(svgHr),
		margin: "0 0 0 10px",
	},
});

// 5. 粗体、斜体、删除线、列表、代码块
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

/**
 * 轻量级 LaTeX 公式转 SVG 矢量渲染引擎
 */
function renderMathToSvg(tex) {
	let cleanTex = tex.trim();

	// 常用 LaTeX 符号转换映射
	const symbols = {
		"\\alpha": "α",
		"\\beta": "β",
		"\\gamma": "γ",
		"\\delta": "δ",
		"\\theta": "θ",
		"\\pi": "π",
		"\\infty": "∞",
		"\\sum": "∑",
		"\\int": "∫",
		"\\times": "×",
		"\\div": "÷",
		"\\pm": "±",
		"\\leq": "≤",
		"\\geq": "≥",
		"\\neq": "≠",
		"\\approx": "≈",
	};

	for (const [key, val] of Object.entries(symbols)) {
		cleanTex = cleanTex.replaceAll(key, val);
	}

	// 解析 \frac{a}{b} -> (a / b)
	cleanTex = cleanTex.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 / $2)");
	// 解析 \sqrt{x} -> √(x)
	cleanTex = cleanTex.replace(/\\sqrt\{([^}]+)\}/g, "√($1)");
	// 解析 x^{2} 或 x^2
	cleanTex = cleanTex.replace(/\^{([^}]+)}/g, "^$1");
	cleanTex = cleanTex.replace(/\_\{([^}]+)}/g, "_$1");

	// 动态生成 SVG 矢量图，字体使用 serif 经典数学斜体
	const svgWidth = Math.max(cleanTex.length * 9 + 10, 30);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="18" viewBox="0 0 ${svgWidth} 18">
        <text x="5" y="13" font-family="KaTeX_Main, Times New Roman, serif" font-style="italic" font-size="13" fill="gray">${escapeHtml(cleanTex)}</text>
    </svg>`;

	return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function activate(context) {
	// 动态存储 LaTeX 公式产生的装饰器句柄，防止内存泄漏
	let mathDecorations = [];

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();
		if (!["cpp", "c", "hpp", "h", "cc", "cxx"].includes(langId)) return;

		const activeLine = activeEditor.selection.active.line;

		// 清理上一次渲染的 LaTeX 装饰器
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

			// 单行 // 与多行 /* */ 解析逻辑
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

			// --- A. LaTeX 数学公式 ($...$ 或 $$...$$) ---
			const mathRegex = /(\$\$|\$)(.*?)\1/g;
			let mm;
			while ((mm = mathRegex.exec(commentContent)) !== null) {
				const fullMatch = mm[0];
				const texExpr = mm[2];
				if (!texExpr.trim()) continue;

				const startIdx = commentOffset + mm.index;
				const endIdx = startIdx + fullMatch.length;

				if (!isCurrentLine) {
					// 隐藏原生的 $tex$ 文本
					hideRanges.push(new vscode.Range(i, startIdx, i, endIdx));

					// 渲染为 SVG 公式图像挂载在行内
					const svgUri = renderMathToSvg(texExpr);
					const mathDeco = vscode.window.createTextEditorDecorationType({
						after: {
							contentIconPath: vscode.Uri.parse(svgUri),
							verticalAlign: "middle",
							margin: "0 4px",
						},
					});
					activeEditor.setDecorations(mathDeco, [new vscode.Range(i, endIdx, i, endIdx)]);
					mathDecorations.push(mathDeco);
				}
			}

			// --- B. 水平分割线 (--- 或 ***) ---
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

			// --- D. 引用块 (> quote) ---
			const quoteMatch = commentContent.match(/^(>\s*)(.*)$/);
			if (quoteMatch) {
				const quotePrefixLen = quoteMatch[1].length;
				const textStartIdx = commentOffset + quotePrefixLen;

				quoteRanges.push(new vscode.Range(i, textStartIdx, i, text.length));

				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
			}

			// --- E. 列表 (- 或 * 或 1.) ---
			const listMatch = commentContent.match(/^((?:[-*]|\d+\.)\s+)/);
			if (listMatch && !quoteMatch) {
				const listPrefixLen = listMatch[1].length;
				listRanges.push(new vscode.Range(i, commentOffset, i, commentOffset + listPrefixLen));
			}

			// --- F. 删除线 (~~text~~) ---
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

			// --- G. 粗体 (**text**) ---
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

			// --- H. 斜体 (*text*) ---
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

			// --- I. 行内代码 (`code`) ---
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
