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

	// 解析 SVG viewBox 获得准确宽高比，并在 SVG 内部注入 em 相对单位实现动态缩放
	texToSvg = function (tex, isDisplay, color) {
		const node = htmlDoc.convert(tex, { display: isDisplay });
		let svgStr = adaptor.innerHTML(node);
		svgStr = svgStr.replace(/currentColor/g, color);

		let ratio = 1.0;
		const vbMatch = svgStr.match(/viewBox=["']([^"']+)["']/);
		if (vbMatch) {
			const parts = vbMatch[1].trim().split(/\s+/).map(Number);
			if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
				ratio = parts[2] / parts[3];
			}
		}

		// 修改 <svg> 属性，注入 em 单位实现 1:1 随代码缩放
		svgStr = svgStr.replace(/<svg[^>]*>/, (match) => {
			let clean = match.replace(/\s*(width|height)=["'][^"']*["']/g, "");
			if (isDisplay) {
				const hEm = Math.min(Math.max(ratio * 1.5, 1.8), 5.5);
				const wEm = (hEm * ratio).toFixed(2);
				return clean.replace(">", ` width="${wEm}em" height="${hEm.toFixed(2)}em" style="vertical-align: middle;">`);
			} else {
				// 行内公式：高度严格锁死在 1.15em，防止挤压导致同行文本错位！
				const hEm = 1.15;
				const wEm = (hEm * ratio).toFixed(2);
				return clean.replace(">", ` width="${wEm}em" height="${hEm}em" style="vertical-align: -0.22em;">`);
			}
		});

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

// --- 2. 静态原子装饰器定义 (静态复用，绝不频繁 dispose 导致闪烁) ---

// 统一公式与语法隐藏样式 (保留基线行高)
const hideMathDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.42em",
});

const hideSyntaxDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.42em",
});

// 单一静态公式挂载装饰器 (彻底告别频繁销毁/重建引起的闪烁)
const mathDecorationType = vscode.window.createTextEditorDecorationType({});

// Markdown 文本样式
const h1Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.35em", fontWeight: "bold" });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.2em", fontWeight: "bold" });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontSize: "1.1em", fontWeight: "bold" });

const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "▌ ",
		color: "rgba(128, 128, 128, 0.65)",
		fontWeight: "bold",
	},
	fontStyle: "italic",
});

const svgHr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="2"><line x1="0" y1="1" x2="500" y2="1" stroke="%23888888" stroke-width="1.2" opacity="0.45"/></svg>';
const hrDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	letterSpacing: "-0.42em",
	after: {
		contentIconPath: vscode.Uri.parse(svgHr),
		margin: "0 0 0 4px",
		verticalAlign: "middle",
	},
});

const listBulletDecoration = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "• ",
		fontWeight: "bold",
		color: "rgba(128, 128, 128, 0.85)",
	},
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through", opacity: "0.65" });
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
	fontFamily: "monospace",
});

function activate(context) {
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
		const hideSyntaxRanges = [],
			hideMathRanges = [];
		const mathRenderOptions = [];

		// 记录受数学公式保护的禁止 Markdown 解析的字符区间
		const multilineMathLines = new Set();

		// --- STEP 1: 全局抓取多行公式 ($$ ... $$) 并锁死禁飞区 ---
		if (texToSvg) {
			const fullText = doc.getText();
			const multilineMathRegex = /\$\$([\s\S]+?)\$\$/g;
			let match;

			while ((match = multilineMathRegex.exec(fullText)) !== null) {
				const rawTex = match[1].trim();
				if (!rawTex) continue;

				const startPos = doc.positionAt(match.index);
				const endPos = doc.positionAt(match.index + match[0].length);

				for (let l = startPos.line; l <= endPos.line; l++) {
					multilineMathLines.add(l);
				}

				const isCursorInFormula = activeLine >= startPos.line && activeLine <= endPos.line;

				// 光标离开多行公式行时，无缝渲染 SVG；靠近时瞬间显示源码
				if (!isCursorInFormula) {
					hideMathRanges.push(new vscode.Range(startPos, endPos));

					try {
						const svgUri = texToSvg(rawTex, true, getMathColor());
						mathRenderOptions.push({
							range: new vscode.Range(startPos, startPos),
							renderOptions: {
								before: {
									contentIconPath: vscode.Uri.parse(svgUri),
								},
							},
						});
					} catch (e) {
						console.error("[cpp-md] 多行 MathJax 渲染错误:", e);
					}
				}
			}
		}

		// --- STEP 2: 逐行处理注释与单行公式遮罩 ---
		let inBlockComment = false;

		for (let i = 0; i < doc.lineCount; i++) {
			if (multilineMathLines.has(i)) continue;

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

			// 抓取单行公式并进行“字符遮罩” (Masking)，彻底防止公式内 * 误报为 Markdown 格式
			const mathSpans = [];
			let maskedComment = commentContent;

			if (texToSvg) {
				const inlineMathRegex = /(\$\$|\$)(.*?)\1/g;
				let mm;
				while ((mm = inlineMathRegex.exec(commentContent)) !== null) {
					const fullMatch = mm[0];
					const texExpr = mm[2];
					if (!texExpr.trim()) continue;

					const startIdx = commentOffset + mm.index;
					const endIdx = startIdx + fullMatch.length;

					mathSpans.push({
						startInContent: mm.index,
						endInContent: mm.index + fullMatch.length,
					});

					// 离开当前行时无缝渲染；停留该行时展示原生 TeX 源码
					if (!isCurrentLine) {
						hideMathRanges.push(new vscode.Range(i, startIdx, i, endIdx));

						try {
							const isDisplay = fullMatch.startsWith("$$");
							const svgUri = texToSvg(texExpr, isDisplay, getMathColor());
							const startPos = new vscode.Position(i, startIdx);

							mathRenderOptions.push({
								range: new vscode.Range(startPos, startPos),
								renderOptions: {
									before: {
										contentIconPath: vscode.Uri.parse(svgUri),
									},
								},
							});
						} catch (e) {
							console.error("[cpp-md] 行内 MathJax 渲染错误:", e);
						}
					}
				}

				// 遮罩公式区间
				for (const m of mathSpans) {
					const maskStr = " ".repeat(m.endInContent - m.startInContent);
					maskedComment = maskedComment.substring(0, m.startInContent) + maskStr + maskedComment.substring(m.endInContent);
				}
			}

			// --- A. 分割线 ---
			if (/^(---|[*]{3}|___)\s*$/.test(commentContent) && mathSpans.length === 0) {
				if (!isCurrentLine) {
					hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				}
				continue;
			}

			// --- B. 标题 ---
			const headerMatch = maskedComment.match(/^(#+)\s+(.*)$/);
			if (headerMatch) {
				const hashLen = headerMatch[1].length;
				const textStartIdx = commentOffset + hashLen + 1;

				const textRange = new vscode.Range(i, textStartIdx, i, text.length);
				if (hashLen === 1) h1Ranges.push(textRange);
				else if (hashLen === 2) h2Ranges.push(textRange);
				else h3Ranges.push(textRange);

				if (!isCurrentLine) {
					hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
				continue;
			}

			// --- C. 引用 ---
			const quoteMatch = maskedComment.match(/^(>\s*)(.*)$/);
			if (quoteMatch) {
				const quotePrefixLen = quoteMatch[1].length;
				const textStartIdx = commentOffset + quotePrefixLen;

				quoteRanges.push(new vscode.Range(i, textStartIdx, i, text.length));

				if (!isCurrentLine) {
					hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
			}

			// --- D. 列表 ---
			const listMatch = maskedComment.match(/^([-*])\s+(.*)$/);
			if (listMatch && !quoteMatch) {
				const prefixLen = 2;
				const textStartIdx = commentOffset + prefixLen;

				if (!isCurrentLine) {
					hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
					listBulletRanges.push(new vscode.Range(i, textStartIdx, i, textStartIdx));
				}
			}

			// --- E. 代码块 ---
			const codeRegex = /`(.*?)`/g;
			let cm;
			while ((cm = codeRegex.exec(maskedComment)) !== null) {
				const startIdx = commentOffset + cm.index;
				const innerStart = startIdx + 1;
				const innerEnd = innerStart + cm[1].length;
				const endIdx = startIdx + cm[0].length;

				codeRanges.push(new vscode.Range(i, innerStart, i, innerEnd));
				if (!isCurrentLine) {
					hideSyntaxRanges.push(new vscode.Range(i, startIdx, i, innerStart));
					hideSyntaxRanges.push(new vscode.Range(i, innerEnd, i, endIdx));
				}

				const maskStr = " ".repeat(cm[0].length);
				maskedComment = maskedComment.substring(0, cm.index) + maskStr + maskedComment.substring(cm.index + cm[0].length);
			}

			// --- F. 递归语法解析器 (处理嵌套粗/斜/删除线) ---
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
					hideSyntaxRanges.push(new vscode.Range(i, openStart, i, openEnd));
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
					hideSyntaxRanges.push(new vscode.Range(i, closeStart, i, closeEnd));
				}

				const remainderStart = best.index + best.fullLen;
				const remainderText = str.substring(remainderStart);
				parseInlineFormatting(remainderText, strOffset + remainderStart, currentStyles);
			}

			parseInlineFormatting(maskedComment, commentOffset, { bold: false, italic: false, strike: false });
		}

		// 应用各类样式 (原子更新，零闪烁)
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
		activeEditor.setDecorations(hideSyntaxDecoration, hideSyntaxRanges);
		activeEditor.setDecorations(hideMathDecoration, hideMathRanges);
		activeEditor.setDecorations(mathDecorationType, mathRenderOptions);
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
