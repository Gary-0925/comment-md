const vscode = require('vscode');

// 定义 1：标题样式 (放大、加粗、青色)
const headerDecoration = vscode.window.createTextEditorDecorationType({
    fontSize: '1.2em',
    fontWeight: 'bold',
    color: '#4EC9B0'
});

// 定义 2：加粗样式 (橙黄色)
const boldDecoration = vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#CE9178'
});

// 定义 3：行内代码块样式 (浅灰背景框)
const codeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    fontFamily: 'monospace'
});

// 定义 4：隐藏 Markdown 语法符号（如 #, **, `）
const hideDecoration = vscode.window.createTextEditorDecorationType({
    opacity: '0',
    letterSpacing: '-0.4em'
});

function activate(context) {
    let activeEditor = vscode.window.activeTextEditor;

    function updateDecorations() {
        if (!activeEditor) return;

        const doc = activeEditor.document;
        if (!['cpp', 'c', 'hpp', 'h', 'cc'].includes(doc.languageId)) return;

        const activeLine = activeEditor.selection.active.line;

        const headers = [];
        const bolds = [];
        const codes = [];
        const hides = [];

        const text = doc.getText();
        const lines = text.split('\n');

        lines.forEach((lineText, lineIdx) => {
            const isCurrentLine = (lineIdx === activeLine);

            const match = lineText.match(/^(.*?)(\/\/|\/\/\/)\s*(.*)$/);
            if (match) {
                const indentAndCode = match[1];
                const commentSymbol = match[2];
                const commentContent = match[3];

                const commentOffset = indentAndCode.length + commentSymbol.length;
                const actualContentOffset = lineText.indexOf(commentContent, commentOffset);

                // A. 匹配 # 标题
                const headerMatch = commentContent.match(/^(#+)\s+(.*)$/);
                if (headerMatch) {
                    const hashLen = headerMatch[1].length;
                    const start = new vscode.Position(lineIdx, actualContentOffset);
                    const end = new vscode.Position(lineIdx, lineText.length);
                    headers.push(new vscode.Range(start, end));

                    if (!isCurrentLine) {
                        const hideEnd = new vscode.Position(lineIdx, actualContentOffset + hashLen + 1);
                        hides.push(new vscode.Range(start, hideEnd));
                    }
                }

                // B. 匹配 **加粗**
                const boldRegex = /\*\*(.*?)\*\*/g;
                let bm;
                while ((bm = boldRegex.exec(commentContent)) !== null) {
                    const startChar = actualContentOffset + bm.index;
                    const endChar = startChar + bm[0].length;
                    const start = new vscode.Position(lineIdx, startChar);
                    const end = new vscode.Position(lineIdx, endChar);
                    bolds.push(new vscode.Range(start, end));

                    if (!isCurrentLine) {
                        hides.push(new vscode.Range(start, new vscode.Position(lineIdx, startChar + 2)));
                        hides.push(new vscode.Range(new vscode.Position(lineIdx, endChar - 2), end));
                    }
                }

                // C. 匹配 `代码`
                const codeRegex = /`(.*?)`/g;
                let cm;
                while ((cm = codeRegex.exec(commentContent)) !== null) {
                    const startChar = actualContentOffset + cm.index;
                    const endChar = startChar + cm[0].length;
                    const start = new vscode.Position(lineIdx, startChar);
                    const end = new vscode.Position(lineIdx, endChar);
                    codes.push(new vscode.Range(start, end));

                    if (!isCurrentLine) {
                        hides.push(new vscode.Range(start, new vscode.Position(lineIdx, startChar + 1)));
                        hides.push(new vscode.Range(new vscode.Position(lineIdx, endChar - 1), end));
                    }
                }
            }
        });

        activeEditor.setDecorations(headerDecoration, headers);
        activeEditor.setDecorations(boldDecoration, bolds);
        activeEditor.setDecorations(codeDecoration, codes);
        activeEditor.setDecorations(hideDecoration, hides);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            activeEditor = editor;
            if (editor) updateDecorations();
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (activeEditor && event.document === activeEditor.document) {
                updateDecorations();
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (activeEditor && event.textEditor === activeEditor) {
                updateDecorations();
            }
        })
    );

    if (activeEditor) {
        updateDecorations();
    }
}

function deactivate() {}

module.exports = { activate, deactivate };