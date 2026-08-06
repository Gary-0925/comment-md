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

	texToSvg = function (tex, isMultiLine, lineCount, color) {
		const node = htmlDoc.convert(tex, { display: isMultiLine });
		let svgStr = adaptor.innerHTML(node);
		svgStr = svgStr.replace(/currentColor/g, color);

		if (!svgStr.includes("xmlns=")) {
			svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
		}

		let ratio = 1.0;
		const vbMatch = svgStr.match(/viewBox=["']([^"']+)["']/);
		if (vbMatch) {
			const parts = vbMatch[1].trim().split(/\s+/).map(Number);
			if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
				ratio = parts[2] / parts[3];
			}
		}

		let va = "-0.2ex";
		const vaMatch = svgStr.match(/vertical-align:\s*([^;"]+)/);
		if (vaMatch) {
			va = vaMatch[1];
		}

		let hEm, wEm;
		if (isMultiLine) {
			hEm = Number((lineCount * 1.25).toFixed(2));
			wEm = Number((hEm * ratio).toFixed(2));
			va = "top";
		} else {
			hEm = 1.05;
			wEm = Number((hEm * ratio).toFixed(2));
		}

		svgStr = svgStr.replace(/<svg[^>]*>/, (match) => {
			let clean = match.replace(/\s*(width|height|style)=["'][^"']*["']/g, "");
			return clean.replace(">", ' width="100%" height="100%">');
		});

		const base64 = Buffer.from(svgStr).toString("base64");
		const uri = "data:image/svg+xml;base64," + base64;

		return { uri, wEm, hEm, va };
	};
} catch (e) {
	console.error("[comment-md] MathJax 引擎加载失败:", e);
}

function getMathColor() {
	try {
		const config = vscode.workspace.getConfiguration("comment-md");
		const customColor = config.get("mathColor");
		if (customColor && customColor !== "auto" && customColor.trim() !== "") {
			return customColor.trim();
		}
	} catch (e) {
		// ignore
	}

	try {
		const tokenCustoms = vscode.workspace.getConfiguration("editor").get("tokenColorCustomizations");
		if (tokenCustoms) {
			if (typeof tokenCustoms.comments === "string") {
				return tokenCustoms.comments;
			}
			if (Array.isArray(tokenCustoms.textMateRules)) {
				for (const rule of tokenCustoms.textMateRules) {
					if (rule.scope && (rule.scope === "comment" || (Array.isArray(rule.scope) && rule.scope.includes("comment")))) {
						if (rule.settings && rule.settings.foreground) {
							return rule.settings.foreground;
						}
					}
				}
			}
		}
	} catch (e) {
		// ignore
	}

	const themeName = (vscode.workspace.getConfiguration("workbench").get("colorTheme") || "").toLowerCase();

	const themeCommentColors = {
		"default dark+": "#6a9955",
		"default dark": "#6a9955",
		"visual studio dark": "#6a9955",
		"default light+": "#008000",
		"default light": "#008000",
		"visual studio light": "#008000",
		"one dark pro": "#7f848e",
		"one dark": "#5c6370",
		dracula: "#6272a4",
		monokai: "#75715e",
		"monokai pro": "#727072",
		"github dark": "#8b949e",
		"github light": "#6e7681",
		nord: "#616e88",
		"tokyo night": "#565f89",
		"solarized dark": "#586e75",
		"solarized light": "#93a1a1",
		"gruvbox dark": "#928374",
		"gruvbox light": "#928374",
		catppuccin: "#6c7086",
		"night owl": "#637777",
		"material theme": "#546e7a",
	};

	for (const [name, color] of Object.entries(themeCommentColors)) {
		if (themeName.includes(name)) {
			return color;
		}
	}

	const kind = vscode.window.activeColorTheme.kind;
	if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
		return "#008000";
	}
	return "#6a9955";
}

/**
 * 检查当前语言是否在设置中启用了渲染开关
 */
function isLanguageEnabled(langId) {
	const langMap = {
		cpp: "cpp",
		"cuda-cpp": "cpp",
		c: "cpp",
		python: "python",
		javascript: "javascript",
		javascriptreact: "javascript",
		typescript: "typescript",
		typescriptreact: "typescript",
		java: "java",
		rust: "rust",
		go: "go",
		csharp: "csharp",
		php: "php",
		swift: "swift",
		kotlin: "kotlin",
		scala: "kotlin",
	};

	const settingKey = langMap[langId];
	if (!settingKey) return false;

	try {
		const config = vscode.workspace.getConfiguration("comment-md.languages");
		return config.get(settingKey, true);
	} catch (e) {
		return true;
	}
}

// --- 2. 静态原子装饰器定义 ---

const hideMathDecoration = vscode.window.createTextEditorDecorationType({ color: "transparent", fontSize: "0px", letterSpacing: "-1em" });
const hideSyntaxDecoration = vscode.window.createTextEditorDecorationType({ color: "transparent", fontSize: "0px", letterSpacing: "-1em" });
const mathDecorationType = vscode.window.createTextEditorDecorationType({});

const hrDecoration = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	borderBottom: "1px solid rgba(128, 128, 128, 0.4)",
	color: "transparent",
	fontSize: "0px",
});

const codeBlockDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.05)",
	isWholeLine: true,
	fontFamily: "monospace",
});

const h1Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });

const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: { contentText: "▌ ", color: "rgba(128, 128, 128, 0.65)", fontWeight: "bold" },
	fontStyle: "italic",
});

const listBulletDecoration = vscode.window.createTextEditorDecorationType({
	before: { contentText: "• ", fontWeight: "bold", color: "rgba(128, 128, 128, 0.85)" },
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
	function clearAllDecorations(editor) {
		if (!editor) return;
		editor.setDecorations(h1Decoration, []);
		editor.setDecorations(h2Decoration, []);
		editor.setDecorations(h3Decoration, []);
		editor.setDecorations(boldDecoration, []);
		editor.setDecorations(italicDecoration, []);
		editor.setDecorations(strikethroughDecoration, []);
		editor.setDecorations(codeDecoration, []);
		editor.setDecorations(codeBlockDecoration, []);
		editor.setDecorations(quoteDecoration, []);
		editor.setDecorations(hrDecoration, []);
		editor.setDecorations(listBulletDecoration, []);
		editor.setDecorations(hideSyntaxDecoration, []);
		editor.setDecorations(hideMathDecoration, []);
		editor.setDecorations(mathDecorationType, []);
	}

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();

		// 检查该语言是否开启了渲染开关
		if (!isLanguageEnabled(langId)) {
			clearAllDecorations(activeEditor);
			return;
		}

		const activeLine = activeEditor.selection.active.line;

		const h1Ranges = [],
			h2Ranges = [],
			h3Ranges = [];
		const boldRanges = [],
			italicRanges = [],
			strikeRanges = [];
		const codeRanges = [],
			codeBlockRanges = [],
			quoteRanges = [],
			hrRanges = [],
			listBulletRanges = [];
		const hideSyntaxRanges = [],
			hideMathRanges = [];
		const mathRenderOptions = [];

		const protectedLines = new Set();

		// --- STEP 1: 扫描多行代码块 (``` ... ```) ---
		let inFencedCode = false;
		for (let i = 0; i < doc.lineCount; i++) {
			const text = doc.lineAt(i).text;
			if (text.includes("```")) {
				protectedLines.add(i);
				inFencedCode = !inFencedCode;
				if (i !== activeLine) {
					hideSyntaxRanges.push(new vscode.Range(i, 0, i, text.length));
				}
			} else if (inFencedCode) {
				protectedLines.add(i);
				codeBlockRanges.push(new vscode.Range(i, 0, i, text.length));
			}
		}

		// --- STEP 2: 扫描全局多行公式 ($$ ... $$) ---
		const multilineMathLines = new Set();
		if (texToSvg) {
			const fullText = doc.getText();
			const multilineMathRegex = /\$\$([\s\S]+?)\$\$/g;
			let match;

			while ((match = multilineMathRegex.exec(fullText)) !== null) {
				const rawTex = match[1].trim();
				if (!rawTex) continue;

				const startPos = doc.positionAt(match.index);
				const endPos = doc.positionAt(match.index + match[0].length);

				if (startPos.line === endPos.line) continue;
				if (protectedLines.has(startPos.line)) continue;

				const lineCount = endPos.line - startPos.line + 1;

				for (let l = startPos.line; l <= endPos.line; l++) {
					multilineMathLines.add(l);
				}

				const isCursorInFormula = activeLine >= startPos.line && activeLine <= endPos.line;

				if (!isCursorInFormula) {
					hideMathRanges.push(new vscode.Range(startPos, endPos));

					try {
						const res = texToSvg(rawTex, true, lineCount, getMathColor());
						mathRenderOptions.push({
							range: new vscode.Range(startPos, startPos),
							renderOptions: {
								before: {
									contentIconPath: vscode.Uri.parse(res.uri),
									width: `${res.wEm}em`,
									height: `${res.hEm}em`,
									verticalAlign: res.va,
								},
							},
						});
					} catch (e) {
						console.error("[comment-md] 多行 MathJax 渲染错误:", e);
					}
				}
			}
		}

		// --- STEP 3: 逐行最左匹配递归 AST 解析引擎 ---
		let inBlockComment = false;

		for (let i = 0; i < doc.lineCount; i++) {
			if (protectedLines.has(i) || multilineMathLines.has(i)) continue;

			const line = doc.lineAt(i);
			const text = line.text;
			const isCurrentLine = i === activeLine;

			let commentOffset = 0;
			let commentContent = "";
			let isCommentLine = false;

			if (langId === "python") {
				if (!inBlockComment) {
					const singleMatch = text.match(/^(\s*#\s*)(.*)$/);
					const docstringStartMatch = text.match(/^(\s*(?:"""|''')\s*)(.*)$/);

					if (singleMatch) {
						isCommentLine = true;
						commentOffset = singleMatch[1].length;
						commentContent = singleMatch[2];
					} else if (docstringStartMatch) {
						isCommentLine = true;
						commentOffset = docstringStartMatch[1].length;
						commentContent = docstringStartMatch[2];
						inBlockComment = true;

						if (commentContent.includes('"""') || commentContent.includes("'''")) {
							inBlockComment = false;
						}
					}
				} else {
					isCommentLine = true;
					commentOffset = text.search(/\S|$/);
					commentContent = text.trim();

					if (text.includes('"""') || text.includes("'''")) {
						inBlockComment = false;
					}
				}
			} else {
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
			}

			if (!isCommentLine || !commentContent) continue;

			let parseContent = commentContent;
			let parseOffset = commentOffset;

			// A. 分割线
			if (/^(---|[*]{3}|___)\s*$/.test(parseContent)) {
				if (!isCurrentLine) {
					hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				}
				continue;
			}

			// B. 标题
			const headerMatch = parseContent.match(/^(#+)\s+(.*)$/);
			if (headerMatch) {
				const hashLen = headerMatch[1].length;
				const textStartIdx = commentOffset + hashLen + 1;

				const textRange = new vscode.Range(i, textStartIdx, i, text.length);
				if (hashLen === 1) h1Ranges.push(textRange);
				else if (hashLen === 2) h2Ranges.push(textRange);
				else h3Ranges.push(textRange);

				if (!isCurrentLine) hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));

				parseContent = headerMatch[2];
				parseOffset = textStartIdx;
			} else {
				const quoteMatch = parseContent.match(/^(>\s*)(.*)$/);
				if (quoteMatch) {
					const quotePrefixLen = quoteMatch[1].length;
					const textStartIdx = commentOffset + quotePrefixLen;

					quoteRanges.push(new vscode.Range(i, textStartIdx, i, text.length));
					if (!isCurrentLine) hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));

					parseContent = quoteMatch[2];
					parseOffset = textStartIdx;
				} else {
					const listMatch = parseContent.match(/^([-*]|\d+\.)\s+(.*)$/);
					if (listMatch) {
						const isUnordered = listMatch[1] === "-" || listMatch[1] === "*";
						const prefixLen = listMatch[1].length + 1;
						const textStartIdx = commentOffset + prefixLen;

						if (!isCurrentLine) {
							if (isUnordered) {
								hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
								listBulletRanges.push(new vscode.Range(i, textStartIdx, i, textStartIdx));
							} else {
								boldRanges.push(new vscode.Range(i, commentOffset, i, commentOffset + listMatch[1].length));
							}
						}

						parseContent = listMatch[2];
						parseOffset = textStartIdx;
					}
				}
			}

			// C. 递归 AST 解析器
			function parseInline(contentStr, startCol, currentStyles) {
				if (!contentStr) return;

				const candidates = [];

				if (texToSvg) {
					const mathRegex = /(\$\$|\$)(.+?)\1/;
					const mm = mathRegex.exec(contentStr);
					if (mm && mm[2].trim()) {
						candidates.push({
							type: "math",
							index: mm.index,
							fullLen: mm[0].length,
							expr: mm[2],
						});
					}
				}

				const codeRegex = /(`+)(.+?)\1/;
				const cm = codeRegex.exec(contentStr);
				if (cm) {
					candidates.push({
						type: "code",
						index: cm.index,
						fullLen: cm[0].length,
						inner: cm[2],
						delimLen: cm[1].length,
					});
				}

				const boldItalicRegex = /\*{3}([\s\S]+?)\*{3}/;
				const bim = boldItalicRegex.exec(contentStr);
				if (bim) {
					candidates.push({
						type: "boldItalic",
						index: bim.index,
						fullLen: bim[0].length,
						inner: bim[1],
						delimLen: 3,
					});
				}

				const boldRegex = /(?<!\*)\*{2}([^*][\s\S]*?)\*{2}(?!\*)/;
				const bm = boldRegex.exec(contentStr);
				if (bm) {
					candidates.push({
						type: "bold",
						index: bm.index,
						fullLen: bm[0].length,
						inner: bm[1],
						delimLen: 2,
					});
				}

				const italicRegex = /(?<!\*)\*([^*]+?)\*(?!\*)/;
				const im = italicRegex.exec(contentStr);
				if (im) {
					candidates.push({
						type: "italic",
						index: im.index,
						fullLen: im[0].length,
						inner: im[1],
						delimLen: 1,
					});
				}

				const strikeRegex = /~~([\s\S]+?)~~/;
				const sm = strikeRegex.exec(contentStr);
				if (sm) {
					candidates.push({
						type: "strike",
						index: sm.index,
						fullLen: sm[0].length,
						inner: sm[1],
						delimLen: 2,
					});
				}

				if (candidates.length === 0) {
					const range = new vscode.Range(i, startCol, i, startCol + contentStr.length);
					applyFormatting(range, currentStyles);
					return;
				}

				candidates.sort((a, b) => a.index - b.index);
				const best = candidates[0];

				if (best.index > 0) {
					const prefixRange = new vscode.Range(i, startCol, i, startCol + best.index);
					applyFormatting(prefixRange, currentStyles);
				}

				const matchStartCol = startCol + best.index;
				const matchEndCol = matchStartCol + best.fullLen;

				if (best.type === "math") {
					if (!isCurrentLine && texToSvg) {
						hideMathRanges.push(new vscode.Range(i, matchStartCol, i, matchEndCol));
						try {
							const res = texToSvg(best.expr, false, 1, getMathColor());
							const startPos = new vscode.Position(i, matchStartCol);

							mathRenderOptions.push({
								range: new vscode.Range(startPos, startPos),
								renderOptions: {
									before: {
										contentIconPath: vscode.Uri.parse(res.uri),
										width: `${res.wEm}em`,
										height: `${res.hEm}em`,
										verticalAlign: res.va,
									},
								},
							});
						} catch (e) {
							console.error("[comment-md] MathJax 渲染错误:", e);
						}
					}
				} else if (best.type === "code") {
					const innerStartCol = matchStartCol + best.delimLen;
					const innerEndCol = matchEndCol - best.delimLen;
					codeRanges.push(new vscode.Range(i, innerStartCol, i, innerEndCol));

					if (!isCurrentLine) {
						hideSyntaxRanges.push(new vscode.Range(i, matchStartCol, i, innerStartCol));
						hideSyntaxRanges.push(new vscode.Range(i, innerEndCol, i, matchEndCol));
					}
				} else {
					const innerStartCol = matchStartCol + best.delimLen;
					const innerEndCol = matchEndCol - best.delimLen;

					if (!isCurrentLine) {
						hideSyntaxRanges.push(new vscode.Range(i, matchStartCol, i, innerStartCol));
						hideSyntaxRanges.push(new vscode.Range(i, innerEndCol, i, matchEndCol));
					}

					const nextStyles = {
						bold: currentStyles.bold || best.type === "bold" || best.type === "boldItalic",
						italic: currentStyles.italic || best.type === "italic" || best.type === "boldItalic",
						strike: currentStyles.strike || best.type === "strike",
					};

					parseInline(best.inner, innerStartCol, nextStyles);
				}

				const afterStartInStr = best.index + best.fullLen;
				if (afterStartInStr < contentStr.length) {
					const afterStr = contentStr.substring(afterStartInStr);
					const afterStartCol = startCol + afterStartInStr;
					parseInline(afterStr, afterStartCol, currentStyles);
				}
			}

			function applyFormatting(range, styles) {
				if (styles.bold) boldRanges.push(range);
				if (styles.italic) italicRanges.push(range);
				if (styles.strike) strikeRanges.push(range);
			}

			parseInline(parseContent, parseOffset, { bold: false, italic: false, strike: false });
		}

		// 应用各类样式
		activeEditor.setDecorations(h1Decoration, h1Ranges);
		activeEditor.setDecorations(h2Decoration, h2Ranges);
		activeEditor.setDecorations(h3Decoration, h3Ranges);
		activeEditor.setDecorations(boldDecoration, boldRanges);
		activeEditor.setDecorations(italicDecoration, italicRanges);
		activeEditor.setDecorations(strikethroughDecoration, strikeRanges);
		activeEditor.setDecorations(codeDecoration, codeRanges);
		activeEditor.setDecorations(codeBlockDecoration, codeBlockRanges);
		activeEditor.setDecorations(quoteDecoration, quoteRanges);
		activeEditor.setDecorations(hrDecoration, hrRanges);
		activeEditor.setDecorations(listBulletDecoration, listBulletRanges);
		activeEditor.setDecorations(hideSyntaxDecoration, hideSyntaxRanges);
		activeEditor.setDecorations(hideMathDecoration, hideMathRanges);
		activeEditor.setDecorations(mathDecorationType, mathRenderOptions);
	}

	// 监听配置和主题变更
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(updateDecorations),
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
				updateDecorations();
			}
		}),
		vscode.window.onDidChangeTextEditorSelection(updateDecorations),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("comment-md")) {
				updateDecorations();
			}
		}),
	);

	updateDecorations();
}

function deactivate() {}

module.exports = { activate, deactivate };
