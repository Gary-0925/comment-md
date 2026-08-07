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

// 尝试获取公式渲染颜色
function getCommentColor() {
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
		"dark modern": "#6a9955",
		"default dark+": "#6a9955",
		"default dark": "#6a9955",
		"visual studio dark": "#6a9955",
		"light modern+": "#008000",
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
		return "#474747";
	}
	return "#898989";
}

// 检查当前语言是否在设置中启用了渲染开关
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

// 静态装饰器定义
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

const h1Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold", textDecoration: "underline" });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold", textDecoration: "underline" });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold", textDecoration: "underline" });
const h4Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const h5Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const h6Decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });

const quoteDecoration = vscode.window.createTextEditorDecorationType({
	before: { contentText: "▌ ", color: getCommentColor(), fontWeight: "bold" },
	fontStyle: "italic",
});

const listBulletDecoration = vscode.window.createTextEditorDecorationType({
	before: { contentText: "• ", fontWeight: "bold", color: getCommentColor() },
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through", opacity: "0.65" });
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
});

function activate(context) {
	function clearAllDecorations(editor) {
		if (!editor) return;
		editor.setDecorations(h1Decoration, []);
		editor.setDecorations(h2Decoration, []);
		editor.setDecorations(h3Decoration, []);
		editor.setDecorations(h4Decoration, []);
		editor.setDecorations(h5Decoration, []);
		editor.setDecorations(h6Decoration, []);
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

	/**
	 * 辅助函数：剥离块级嵌套前缀（引用、列表等），取得净文本
	 */
	function getCleanContent(str) {
		let text = str;
		while (true) {
			let replaced = false;
			const q = text.match(/^\s*>\s*/);
			if (q) {
				text = text.slice(q[0].length);
				replaced = true;
				continue;
			}
			const l = text.match(/^\s*([-*+]|\d+\.)\s+/);
			if (l) {
				text = text.slice(l[0].length);
				replaced = true;
				continue;
			}
			break;
		}
		return text.trim();
	}

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();

		if (!isLanguageEnabled(langId)) {
			clearAllDecorations(activeEditor);
			return;
		}

		const activeLine = activeEditor.selection.active.line;

		const h1Ranges = [],
			h2Ranges = [],
			h3Ranges = [],
			h4Ranges = [],
			h5Ranges = [],
			h6Ranges = [];
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

		// --- STEP 1: 提取所有连续的“注释块 (Comment Block)” ---
		const commentBlocks = [];
		let currentBlock = [];
		let inBlockComment = false;

		for (let i = 0; i < doc.lineCount; i++) {
			const line = doc.lineAt(i);
			const text = line.text;

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

			if (isCommentLine) {
				currentBlock.push({
					lineIndex: i,
					offset: commentOffset,
					content: commentContent,
				});
			} else {
				if (currentBlock.length > 0) {
					commentBlocks.push(currentBlock);
					currentBlock = [];
				}
			}
		}
		if (currentBlock.length > 0) {
			commentBlocks.push(currentBlock);
		}

		// --- STEP 2: 独立解析各个注释块（块间状态互不干扰） ---
		for (const block of commentBlocks) {
			const protectedLines = new Set();
			const multilineMathLines = new Set();

			// --- Pass 2.1: 块级状态扫描 (代码块 ``` 与 多行公式 $$) ---
			let inFencedCode = false;
			let inDisplayMath = false;

			let mathStartLineIndex = -1;
			let mathStartCol = -1;
			let mathEndCol = -1;
			let mathBuffer = [];

			for (let k = 0; k < block.length; k++) {
				const item = block[k];
				const lineIdx = item.lineIndex;
				const cleanText = getCleanContent(item.content);

				// 1) 代码块内部
				if (inFencedCode) {
					protectedLines.add(lineIdx);
					codeBlockRanges.push(new vscode.Range(lineIdx, 0, lineIdx, doc.lineAt(lineIdx).text.length));
					if (cleanText.startsWith("```")) {
						inFencedCode = false;
						if (lineIdx !== activeLine) {
							hideSyntaxRanges.push(new vscode.Range(lineIdx, item.offset, lineIdx, doc.lineAt(lineIdx).text.length));
						}
					}
					continue;
				}

				// 2) 多行公式内部
				if (inDisplayMath) {
					multilineMathLines.add(lineIdx);
					// 严格判断：核心内容仅有 $$ 时结束
					if (cleanText === "$$") {
						inDisplayMath = false;
						const mathEndLineIndex = lineIdx;
						mathEndCol = item.offset + item.content.indexOf("$$") + 2;

						const startPos = new vscode.Position(mathStartLineIndex, mathStartCol);
						const endPos = new vscode.Position(mathEndLineIndex, mathEndCol);
						const lineCount = mathEndLineIndex - mathStartLineIndex + 1;
						const rawTex = mathBuffer.join("\n").trim();

						const isCursorInFormula = activeLine >= mathStartLineIndex && activeLine <= mathEndLineIndex;

						if (!isCursorInFormula && rawTex && texToSvg) {
							hideMathRanges.push(new vscode.Range(startPos, endPos));
							try {
								const res = texToSvg(rawTex, true, lineCount, getCommentColor());
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
						mathBuffer = [];
					} else {
						mathBuffer.push(item.content);
					}
					continue;
				}

				// 3) 检查开启代码块 ```
				if (cleanText.startsWith("```")) {
					inFencedCode = true;
					protectedLines.add(lineIdx);
					if (lineIdx !== activeLine) {
						hideSyntaxRanges.push(new vscode.Range(lineIdx, item.offset, lineIdx, doc.lineAt(lineIdx).text.length));
					}
					continue;
				}

				// 4) 检查开启多行公式 $$ (严格要求整行净文本仅有 $$)
				if (cleanText === "$$") {
					inDisplayMath = true;
					multilineMathLines.add(lineIdx);
					mathStartLineIndex = lineIdx;
					mathStartCol = item.offset + item.content.indexOf("$$");
					mathBuffer = [];
					continue;
				}
			}

			// --- Pass 2.2: 嵌套块语法与行内递归 AST 解析 ---
			for (let k = 0; k < block.length; k++) {
				const item = block[k];
				const i = item.lineIndex;
				if (protectedLines.has(i) || multilineMathLines.has(i)) continue;

				const isCurrentLine = i === activeLine;
				let curCol = item.offset;
				let remText = item.content;

				if (!remText) continue;

				// A. 嵌套块语法提取 (例如: > > - # )
				let isHR = false;
				while (remText.length > 0) {
					// 1) 分割线
					if (/^\s*(---|[*]{3}|___)\s*$/.test(remText)) {
						if (!isCurrentLine) {
							hrRanges.push(new vscode.Range(i, item.offset, i, doc.lineAt(i).text.length));
						}
						isHR = true;
						break;
					}

					// 2) 引用 (> )
					const qMatch = remText.match(/^(\s*>\s*)/);
					if (qMatch) {
						const prefixLen = qMatch[1].length;
						quoteRanges.push(new vscode.Range(i, curCol, i, item.offset + item.content.length));
						if (!isCurrentLine) {
							hideSyntaxRanges.push(new vscode.Range(i, curCol, i, curCol + prefixLen));
						}
						curCol += prefixLen;
						remText = remText.slice(prefixLen);
						continue;
					}

					// 3) 列表 (- , * , + , 1. ) -> 包括 JSDoc 每行的 * 号
					const lMatch = remText.match(/^(\s*([-*+]|\d+\.)\s+)/);
					if (lMatch) {
						const prefixLen = lMatch[1].length;
						const markerText = lMatch[2];
						const isUnordered = /^[-*+]$/.test(markerText);

						if (!isCurrentLine) {
							if (isUnordered) {
								hideSyntaxRanges.push(new vscode.Range(i, curCol, i, curCol + prefixLen));
								listBulletRanges.push(new vscode.Range(i, curCol + prefixLen, i, curCol + prefixLen));
							} else {
								boldRanges.push(new vscode.Range(i, curCol, i, curCol + markerText.length));
							}
						}
						curCol += prefixLen;
						remText = remText.slice(prefixLen);
						continue;
					}

					// 4) 标题 (# - ######)
					const hMatch = remText.match(/^(\s*(#{1,6})\s+)/);
					if (hMatch) {
						const prefixLen = hMatch[1].length;
						const hashLen = hMatch[2].length;
						const textRange = new vscode.Range(i, curCol + prefixLen, i, item.offset + item.content.length);

						if (hashLen === 1) h1Ranges.push(textRange);
						else if (hashLen === 2) h2Ranges.push(textRange);
						else if (hashLen === 3) h3Ranges.push(textRange);
						else if (hashLen === 4) h4Ranges.push(textRange);
						else if (hashLen === 5) h5Ranges.push(textRange);
						else if (hashLen === 6) h6Ranges.push(textRange);

						if (!isCurrentLine) {
							hideSyntaxRanges.push(new vscode.Range(i, curCol, i, curCol + prefixLen));
						}
						curCol += prefixLen;
						remText = remText.slice(prefixLen);
						break;
					}

					break;
				}

				if (isHR || !remText) continue;

				// B. 行内递归 AST 解析器
				function parseInline(contentStr, startCol, currentStyles) {
					if (!contentStr) return;

					const candidates = [];

					// 1) 行内公式
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

					// 2) 行内代码
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

					// 3) 粗体斜体删除线
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

					// 最左竞争优先
					candidates.sort((a, b) => a.index - b.index);
					const best = candidates[0];

					if (best.index > 0) {
						const prefixRange = new vscode.Range(i, startCol, i, startCol + best.index);
						applyFormatting(prefixRange, currentStyles);
					}

					const matchStartCol = startCol + best.index;
					const matchEndCol = matchStartCol + best.fullLen;

					// 公式和代码均为原子节点，不递归内部
					if (best.type === "math") {
						if (!isCurrentLine && texToSvg) {
							hideMathRanges.push(new vscode.Range(i, matchStartCol, i, matchEndCol));
							try {
								const res = texToSvg(best.expr, false, 1, getCommentColor());
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
						// 格式样式继续递归解析 inner
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

				parseInline(remText, curCol, { bold: false, italic: false, strike: false });
			}
		}

		// --- STEP 3: 应用所有的 Decorations ---
		activeEditor.setDecorations(h1Decoration, h1Ranges);
		activeEditor.setDecorations(h2Decoration, h2Ranges);
		activeEditor.setDecorations(h3Decoration, h3Ranges);
		activeEditor.setDecorations(h4Decoration, h4Ranges);
		activeEditor.setDecorations(h5Decoration, h5Ranges);
		activeEditor.setDecorations(h6Decoration, h6Ranges);
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

	// 监听编辑器事件
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
