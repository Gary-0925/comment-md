const vscode = require('vscode');

// --- 1. MathJax 全功能矢量渲染引擎 ---
let texToSvg = null;
try {
    const { mathjax } = require('mathjax-full/js/mathjax.js');
    const { TeX } = require('mathjax-full/js/input/tex.js');
    const { SVG } = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const htmlDoc = mathjax.document('', {
        InputJax: new TeX({ packages: AllPackages }),
        OutputJax: new SVG({ fontCache: 'none' })
    });

    // 解析 MathJax SVG viewBox，精准换算 em 相对单位，确保 1:1 随代码字号等比缩放
    texToSvg = function(tex, isDisplay, color) {
        const node = htmlDoc.convert(tex, { display: isDisplay });
        let svgStr = adaptor.innerHTML(node);
        svgStr = svgStr.replace(/currentColor/g, color);

        if (!svgStr.includes('xmlns=')) {
            svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        let wEm = 1.0, hEm = 1.0, vaEm = -0.25;
        const vbMatch = svgStr.match(/viewBox=["']([^"']+)["']/);
        if (vbMatch) {
            const parts = vbMatch[1].trim().split(/\s+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                const W = parts[2];
                const H = parts[3];
                const minY = parts[1];

                const rawHEm = H / 1000;
                const rawWEm = W / 1000;
                const depthEm = (minY + H) / 1000;

                if (isDisplay) {
                    hEm = Math.min(Math.max(rawHEm, 1.2), 5.5);
                    wEm = hEm * (W / H);
                    vaEm = -0.2;
                } else {
                    // 行内公式：高度锁死在 1.18em 内，防止挤压同行文本
                    hEm = Math.min(rawHEm, 1.18);
                    wEm = hEm * (W / H);
                    vaEm = -Math.max(depthEm, 0.18);
                }
            }
        }

        // 清理原有固定像素属性，注入原生 em 比例，实现 100% 随编辑器字号 Zoom 缩放
        svgStr = svgStr.replace(/<svg[^>]*>/, (match) => {
            let clean = match.replace(/\s*(width|height|style)=["'][^"']*["']/g, '');
            return clean.replace('>', ` width="${wEm.toFixed(2)}em" height="${hEm.toFixed(2)}em" style="vertical-align: ${vaEm.toFixed(2)}em;">`);
        });

        // 统一 Base64 编码，保证 100% 渲染成功不空白！
        const base64 = Buffer.from(svgStr).toString('base64');
        return 'data:image/svg+xml;base64,' + base64;
    };
} catch (e) {
    console.error('[cpp-md] MathJax 引擎加载失败:', e);
}

function getMathColor() {
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
        return '#222222';
    }
    return '#E0E0E0';
}

// --- 2. 装饰器定义 ---

const hideMathDecoration = vscode.window.createTextEditorDecorationType({ color: 'transparent', letterSpacing: '-0.42em' });
const hideSyntaxDecoration = vscode.window.createTextEditorDecorationType({ color: 'transparent', letterSpacing: '-0.42em' });
const mathDecorationType = vscode.window.createTextEditorDecorationType({});

// Markdown 基础样式
const h1Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.35em', fontWeight: 'bold' });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.2em', fontWeight: 'bold' });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.1em', fontWeight: 'bold' });

const quoteDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '▌ ', color: 'rgba(128, 128, 128, 0.65)', fontWeight: 'bold' },
    fontStyle: 'italic'
});

// 【彻底修复】：分割线原生整行边框，随窗口宽度 100% 动态自适应伸缩
const hrDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderBottom: '1px solid rgba(128, 128, 128, 0.4)'
});

const listBulletDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '• ', fontWeight: 'bold', color: 'rgba(128, 128, 128, 0.85)' }
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: 'bold' });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: 'italic' });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: 'line-through', opacity: '0.65' });

// 行内代码样式
const codeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    fontFamily: 'monospace'
});

// 【彻底修复】：多行代码块整行暗色背框卡片，随窗口宽度 100% 动态自适应伸缩
const codeBlockDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    isWholeLine: true,
    fontFamily: 'monospace'
});

// 动态公式句柄，刷新时彻底销毁，解决右侧公式堆叠 BUG
let activeMathDecorations = [];

function activate(context) {

    function updateDecorations() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const doc = activeEditor.document;
        const langId = doc.languageId.toLowerCase();
        if (!['cpp', 'c', 'hpp', 'h', 'cc', 'cxx'].includes(langId)) return;

        const activeLine = activeEditor.selection.active.line;

        // 销毁上一帧的公式句柄
        activeMathDecorations.forEach(d => d.dispose());
        activeMathDecorations = [];

        const h1Ranges = [], h2Ranges = [], h3Ranges = [];
        const boldRanges = [], italicRanges = [], strikeRanges = [];
        const codeRanges = [], codeBlockRanges = [], quoteRanges = [], hrRanges = [], listBulletRanges = [];
        const hideSyntaxRanges = [], hideMathRanges = [];
        const mathRenderOptions = [];

        const protectedLines = new Set();

        // --- STEP 1: 优先扫描多行代码块 (``` ... ```) 建立最高级别保护防区 ---
        let inFencedCode = false;
        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text;
            const fenceMatch = text.match(/```[a-zA-Z0-9]*/);

            if (fenceMatch) {
                protectedLines.add(i);
                inFencedCode = !inFencedCode;
                codeBlockRanges.push(new vscode.Range(i, 0, i, text.length));
                if (i !== activeLine) {
                    hideSyntaxRanges.push(new vscode.Range(i, 0, i, text.length));
                }
                continue;
            }

            if (inFencedCode) {
                protectedLines.add(i);
                codeBlockRanges.push(new vscode.Range(i, 0, i, text.length));
            }
        }

        // --- STEP 2: 全局多行公式 ($$ ... $$) 扫描 ---
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

                // 如果多行公式在代码块内部，100% 屏蔽公式渲染！
                if (protectedLines.has(startPos.line)) continue;

                for (let l = startPos.line; l <= endPos.line; l++) {
                    multilineMathLines.add(l);
                }

                const isCursorInFormula = (activeLine >= startPos.line && activeLine <= endPos.line);

                if (!isCursorInFormula) {
                    hideMathRanges.push(new vscode.Range(startPos, endPos));

                    try {
                        const svgUri = texToSvg(rawTex, true, getMathColor());
                        mathRenderOptions.push({
                            range: new vscode.Range(startPos, startPos),
                            renderOptions: {
                                before: {
                                    contentIconPath: vscode.Uri.parse(svgUri)
                                }
                            }
                        });
                    } catch (e) {
                        console.error('[cpp-md] 多行 MathJax 渲染错误:', e);
                    }
                }
            }
        }

        // --- STEP 3: 逐行最左匹配递归 AST 解析器 ---
        let inBlockComment = false;

        for (let i = 0; i < doc.lineCount; i++) {
            if (protectedLines.has(i) || multilineMathLines.has(i)) continue;

            const line = doc.lineAt(i);
            const text = line.text;
            const isCurrentLine = (i === activeLine);

            let commentOffset = 0;
            let commentContent = '';
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

                    if (commentContent.includes('*/')) {
                        inBlockComment = false;
                        commentContent = commentContent.substring(0, commentContent.indexOf('*/'));
                    }
                }
            } else {
                isCommentLine = true;
                commentOffset = text.search(/\S|$/);
                commentContent = text.trim();

                if (text.includes('*/')) {
                    inBlockComment = false;
                    const endIdx = commentContent.indexOf('*/');
                    if (endIdx !== -1) {
                        commentContent = commentContent.substring(0, endIdx);
                    }
                }
            }

            if (!isCommentLine || !commentContent) continue;

            let parseContent = commentContent;
            let parseOffset = commentOffset;

            // A. 块级元素: 分割线、标题、引用、列表
            if (/^(---|[*]{3}|___)\s*$/.test(parseContent)) {
                if (!isCurrentLine) {
                    hrRanges.push(new vscode.Range(i, commentOffset, i, text.length));
                    hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, text.length));
                }
                continue;
            }

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
                    const listMatch = parseContent.match(/^([-*])\s+(.*)$/);
                    if (listMatch) {
                        const prefixLen = 2;
                        const textStartIdx = commentOffset + prefixLen;

                        if (!isCurrentLine) {
                            hideSyntaxRanges.push(new vscode.Range(i, commentOffset, i, textStartIdx));
                            listBulletRanges.push(new vscode.Range(i, textStartIdx, i, textStartIdx));
                        }

                        parseContent = listMatch[2];
                        parseOffset = textStartIdx;
                    }
                }
            }

            // B. 核心：单趟最左匹配递归 AST 词法分析器 (Earliest-Match Inline Lexer)
            function parseInline(contentStr, contentStartCol, currentStyles) {
                let pos = 0;

                while (pos < contentStr.length) {
                    const rest = contentStr.substring(pos);
                    const candidates = [];

                    // 1. 数学公式 ($...$ 或 $$...$$)
                    if (texToSvg) {
                        const mathRegex = /(\$\$|\$)(.+?)\1/;
                        const mm = mathRegex.exec(rest);
                        if (mm && mm[2].trim()) {
                            candidates.push({
                                type: 'math',
                                index: pos + mm.index,
                                fullLen: mm[0].length,
                                expr: mm[2],
                                isDisplay: mm[1] === '$$'
                            });
                        }
                    }

                    // 2. 行内代码 (`...` 或 ``...``)
                    const codeRegex = /(`+)(.+?)\1/;
                    const cm = codeRegex.exec(rest);
                    if (cm) {
                        candidates.push({
                            type: 'code',
                            index: pos + cm.index,
                            fullLen: cm[0].length,
                            inner: cm[2],
                            delimLen: cm[1].length
                        });
                    }

                    // 3. 粗斜体 (***...***)
                    const boldItalicRegex = /\*{3}([\s\S]+?)\*{3}/;
                    const bim = boldItalicRegex.exec(rest);
                    if (bim) {
                        candidates.push({
                            type: 'boldItalic',
                            index: pos + bim.index,
                            fullLen: bim[0].length,
                            inner: bim[1],
                            delimLen: 3
                        });
                    }

                    // 4. 粗体 (**...**)
                    const boldRegex = /(?<!\*)\*{2}([^*][\s\S]*?)\*{2}(?!\*)/;
                    const bm = boldRegex.exec(rest);
                    if (bm) {
                        candidates.push({
                            type: 'bold',
                            index: pos + bm.index,
                            fullLen: bm[0].length,
                            inner: bm[1],
                            delimLen: 2
                        });
                    }

                    // 5. 斜体 (*...*)
                    const italicRegex = /(?<!\*)\*([^*]+?)\*(?!\*)/;
                    const im = italicRegex.exec(rest);
                    if (im) {
                        candidates.push({
                            type: 'italic',
                            index: pos + im.index,
                            fullLen: im[0].length,
                            inner: im[1],
                            delimLen: 1
                        });
                    }

                    // 6. 删除线 (~~...~~)
                    const strikeRegex = /~~([\s\S]+?)~~/;
                    const sm = strikeRegex.exec(rest);
                    if (sm) {
                        candidates.push({
                            type: 'strike',
                            index: pos + sm.index,
                            fullLen: sm[0].length,
                            inner: sm[1],
                            delimLen: 2
                        });
                    }

                    if (candidates.length === 0) {
                        if (rest.length > 0) {
                            const range = new vscode.Range(i, contentStartCol + pos, i, contentStartCol + contentStr.length);
                            applyFormatting(range, currentStyles);
                        }
                        break;
                    }

                    // 最左匹配优先
                    candidates.sort((a, b) => a.index - b.index);
                    const best = candidates[0];

                    if (best.index > pos) {
                        const range = new vscode.Range(i, contentStartCol + pos, i, contentStartCol + best.index);
                        applyFormatting(range, currentStyles);
                    }

                    const tokenStartCol = contentStartCol + best.index;
                    const tokenEndCol = tokenStartCol + best.fullLen;

                    if (best.type === 'math') {
                        // 公式优先在最左侧：整段公式被作为一个原子 TeX 吞掉，内部的反引号绝对不干扰解析！
                        if (!isCurrentLine && texToSvg) {
                            hideMathRanges.push(new vscode.Range(i, tokenStartCol, i, tokenEndCol));
                            try {
                                const svgUri = texToSvg(best.expr, best.isDisplay, getMathColor());
                                const startPos = new vscode.Position(i, tokenStartCol);

                                mathRenderOptions.push({
                                    range: new vscode.Range(startPos, startPos),
                                    renderOptions: {
                                        before: {
                                            contentIconPath: vscode.Uri.parse(svgUri)
                                        }
                                    }
                                });
                            } catch (e) {
                                console.error('[cpp-md] MathJax 渲染错误:', e);
                            }
                        }
                        pos = best.index + best.fullLen;
                    } else if (best.type === 'code') {
                        // 代码优先在最左侧：整段代码被作为原子代码块吞掉，内部的 $x$ 绝对不触发公式渲染！
                        const innerStart = tokenStartCol + best.delimLen;
                        const innerEnd = tokenEndCol - best.delimLen;
                        codeRanges.push(new vscode.Range(i, innerStart, i, innerEnd));

                        if (!isCurrentLine) {
                            hideSyntaxRanges.push(new vscode.Range(i, tokenStartCol, i, innerStart));
                            hideSyntaxRanges.push(new vscode.Range(i, innerEnd, i, tokenEndCol));
                        }
                        pos = best.index + best.fullLen;
                    } else {
                        // 格式化标记 (粗体/斜体/粗斜体/删除线)，隐藏左右符号，并【递归解析】内部嵌套文本！
                        const openEnd = tokenStartCol + best.delimLen;
                        const closeStart = tokenEndCol - best.delimLen;

                        if (!isCurrentLine) {
                            hideSyntaxRanges.push(new vscode.Range(i, tokenStartCol, i, openEnd));
                            hideSyntaxRanges.push(new vscode.Range(i, closeStart, i, closeEnd));
                        }

                        const nextStyles = {
                            bold: currentStyles.bold || best.type === 'bold' || best.type === 'boldItalic',
                            italic: currentStyles.italic || best.type === 'italic' || best.type === 'boldItalic',
                            strike: currentStyles.strike || best.type === 'strike'
                        };

                        parseInline(best.inner, openEnd, nextStyles);

                        pos = best.index + best.fullLen;
                    }
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

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateDecorations),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
                updateDecorations();
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(updateDecorations)
    );

    updateDecorations();
}

function deactivate() {}

module.exports = { activate, deactivate };