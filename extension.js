const vscode = require("vscode");

// 1. 隐藏符号样式 (彻底透明且不占宽度)
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent",
	fontSize: "0px",
	letterSpacing: "-1em",
});

// 2. 多级标题样式（保持原生主题颜色）
const h1Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "18px",
	fontWeight: "bold",
	borderBottom: "1px solid rgba(128, 128, 128, 0.3)",
});

const h2Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "16px",
	fontWeight: "bold",
});

const h3Decoration = vscode.window.createTextEditorDecorationType({
	fontSize: "14px",
	fontWeight: "bold",
});

// 3. 粗体 & 斜体 & 删除线
const boldDecoration = vscode.window.createTextEditorDecorationType({
	fontWeight: "bold",
});

const italicDecoration = vscode.window.createTextEditorDecorationType({
	fontStyle: "italic",
});

const strikethroughDecoration = vscode.window.createTextEditorDecorationType({
	textDecoration: "line-through",
	opacity: "0.65",
});

// 4. 代码块
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.08)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.15)",
	fontFamily: "monospace",
});

// 5. 引用块 (Blockquote)：左侧增加经典 Markdown 竖线
const quoteDecoration = vscode.window.createTextEditorDecorationType({
	borderLeft: "3px solid rgba(128, 128, 128, 0.5)",
	paddingLeft: "6px",
	fontStyle: "italic",
});

// 6. 水平分割线 (---)
const hrDecoration = vscode.window.createTextEditorDecorationType({
	borderBottom: "1px dashed rgba(128, 128, 128, 0.4)",
	width: "100%",
});

// 7. 列表标记 (- 或 *)
const listDecoration = vscode.window.createTextEditorDecorationType({
	fontWeight: "bold",
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
			listRanges = [];
		const hideRanges = [];

		let inBlockComment = false; // 状态机：标记是否处于多行注释中

		for (let i = 0; i < doc.lineCount; i++) {
			const line = doc.lineAt(i);
			const text = line.text;
			const isCurrentLine = i === activeLine; // 光标在当前行不隐藏符号

			let commentOffset = 0;
			let commentContent = "";
			let isCommentLine = false;

			// --- 状态机：判断单行 / 多行注释 ---
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

			// --- A. 水平分割线 (--- 或 ***) ---
			if (/^(---|[*]{3}|___)\s*$/.test(commentContent)) {
				hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, text.length));
				}
				continue;
			}

			// --- B. 标题 (#, ##, ###) ---
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

			// --- C. 引用块 (> quote) ---
			const quoteMatch = commentContent.match(/^(>\s*)(.*)$/);
			if (quoteMatch) {
				const quotePrefixLen = quoteMatch[1].length;
				const textStartIdx = commentOffset + quotePrefixLen;

				quoteRanges.push(new vscode.Range(i, textStartIdx, i, text.length));

				if (!isCurrentLine) {
					hideRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
				}
			}

			// --- D. 列表 (- 或 * 或 1.) ---
			const listMatch = commentContent.match(/^((?:[-*]|\d+\.)\s+)/);
			if (listMatch && !quoteMatch) {
				const listPrefixLen = listMatch[1].length;
				listRanges.push(new vscode.Range(i, commentOffset, i, commentOffset + listPrefixLen));
			}

			// --- E. 删除线 (~~text~~) ---
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

			// --- F. 粗体 (**text**) ---
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

			// --- G. 斜体 (*text*) ---
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

			// --- H. 行内代码 (`code`) ---
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

		// 应用所有样式
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
