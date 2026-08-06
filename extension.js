const vscode = require("vscode");

console.log("[cpp-md] 插件脚本已成功加载！");

// 1. 标题样式：放大 + 加粗 + 亮青色
const headerDecoration = vscode.window.createTextEditorDecorationType({
	fontSize: "1.3em",
	fontWeight: "bold",
	color: "#4EC9B0",
});

// 2. 加粗样式：亮橙色
const boldDecoration = vscode.window.createTextEditorDecorationType({
	fontWeight: "bold",
	color: "#CE9178",
});

// 3. 行内代码块样式：浅色背景框
const codeDecoration = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 255, 0.1)",
	borderRadius: "3px",
	border: "1px solid rgba(255, 255, 255, 0.2)",
	fontFamily: "monospace",
});

// 4. 彻底隐藏语法符号（#、**、`）
const hideDecoration = vscode.window.createTextEditorDecorationType({
	color: "transparent", // 文字变透明
	letterSpacing: "-0.5em", // 压缩宽度
});

function activate(context) {
	console.log("[cpp-md] 插件已成功激活！");

	function updateDecorations() {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) return;

		const doc = activeEditor.document;
		const langId = doc.languageId.toLowerCase();

		// 支持 C/C++ 相关文件类型
		if (!["cpp", "c", "hpp", "h", "cc", "cxx"].includes(langId)) {
			return;
		}

		const activeLine = activeEditor.selection.active.line;
		const headers = [];
		const bolds = [];
		const codes = [];
		const hides = [];

		// 逐行扫描
		for (let i = 0; i < doc.lineCount; i++) {
			const line = doc.lineAt(i);
			const text = line.text;
			const isCurrentLine = i === activeLine; // 光标所在行不隐藏符号

			// 匹配 // 或 /// 注释
			const commentMatch = text.match(/(\/\/|\/\/\/)\s*(.*)/);
			if (!commentMatch) continue;

			const commentStartIndex = commentMatch.index;
			const commentContent = commentMatch[2];
			const contentOffset = text.indexOf(commentContent, commentStartIndex);

			// A. 匹配 # 标题
			const headerMatch = commentContent.match(/^(#+)\s+(.*)/);
			if (headerMatch) {
				const hashStr = headerMatch[1];
				const hashIndex = text.indexOf(hashStr, contentOffset);

				headers.push(new vscode.Range(new vscode.Position(i, hashIndex), new vscode.Position(i, text.length)));

				// 只有当光标离开这一行时，才把 # 隐藏掉
				if (!isCurrentLine) {
					hides.push(new vscode.Range(new vscode.Position(i, hashIndex), new vscode.Position(i, hashIndex + hashStr.length + 1)));
				}
			}

			// B. 匹配 **加粗**
			const boldRegex = /\*\*(.*?)\*\*/g;
			let bm;
			while ((bm = boldRegex.exec(commentContent)) !== null) {
				const startIdx = text.indexOf("**", contentOffset + bm.index);
				const endIdx = startIdx + bm[0].length;

				bolds.push(new vscode.Range(new vscode.Position(i, startIdx), new vscode.Position(i, endIdx)));

				if (!isCurrentLine) {
					// 隐藏开头的 ** 和结尾的 **
					hides.push(new vscode.Range(new vscode.Position(i, startIdx), new vscode.Position(i, startIdx + 2)));
					hides.push(new vscode.Range(new vscode.Position(i, endIdx - 2), new vscode.Position(i, endIdx)));
				}
			}

			// C. 匹配 `代码`
			const codeRegex = /`(.*?)`/g;
			let cm;
			while ((cm = codeRegex.exec(commentContent)) !== null) {
				const startIdx = text.indexOf("`", contentOffset + cm.index);
				const endIdx = startIdx + cm[0].length;

				codes.push(new vscode.Range(new vscode.Position(i, startIdx), new vscode.Position(i, endIdx)));

				if (!isCurrentLine) {
					// 隐藏开头的 ` 和结尾的 `
					hides.push(new vscode.Range(new vscode.Position(i, startIdx), new vscode.Position(i, startIdx + 1)));
					hides.push(new vscode.Range(new vscode.Position(i, endIdx - 1), new vscode.Position(i, endIdx)));
				}
			}
		}

		// 应用样式
		activeEditor.setDecorations(headerDecoration, headers);
		activeEditor.setDecorations(boldDecoration, bolds);
		activeEditor.setDecorations(codeDecoration, codes);
		activeEditor.setDecorations(hideDecoration, hides);
	}

	// 绑定事件
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(updateDecorations),
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
				updateDecorations();
			}
		}),
		vscode.window.onDidChangeTextEditorSelection(updateDecorations),
	);

	// 立即刷新一次
	updateDecorations();
}

function deactivate() {}

module.exports = { activate, deactivate };
