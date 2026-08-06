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

    // 解析 MathJax SVG viewBox，换算准确的 em 相对单位
    texToSvg = function(tex, isDisplay, color) {
        const node = htmlDoc.convert(tex, { display: isDisplay });
        let svgStr = adaptor.innerHTML(node);
        
        // 动态替换矢量颜色为当前配置/主题的颜色
        svgStr = svgStr.replace(/currentColor/g, color);

        if (!svgStr.includes('xmlns=')) {
            svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        let ratio = 1.0;
        const vbMatch = svgStr.match(/viewBox=["']([^"']+)["']/);
        if (vbMatch) {
            const parts = vbMatch[1].trim().split(/\s+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                ratio = parts[2] / parts[3];
            }
        }

        // 提取 MathJax 原生导出的精准 vertical-align
        let va = isDisplay ? 'middle' : '-0.25ex';
        const vaMatch = svgStr.match(/vertical-align:\s*([^;"]+)/);
        if (vaMatch) {
            va = vaMatch[1];
        }

        // 让 SVG 内部自适应 100%，由外部 em 容器控制 1:1 代码字号等比缩放
        svgStr = svgStr.replace(/<svg[^>]*>/, (match) => {
            let clean = match.replace(/\s*(width|height|style)=["'][^"']*["']/g, '');
            return clean.replace('>', ' width="100%" height="100%">');
        });

        let hEm, wEm;
        if (isDisplay) {
            hEm = 2.2;
            wEm = Number((hEm * ratio).toFixed(2));
        } else {
            hEm = 1.02; // 锁定行内高度，防止顶部溢出
            wEm = Number((hEm * ratio).toFixed(2));
        }

        const base64 = Buffer.from(svgStr).toString('base64');
        const uri = 'data:image/svg+xml;base64,' + base64;

        return { uri, wEm, hEm, va };
    };
} catch (e) {
    console.error('[cpp-md] MathJax 引擎加载失败:', e);
}

/**
 * 智能读取公式渲染颜色：优先读取用户手动配置，auto 时自动匹配当前主题
 */
function getMathColor() {
    // 1. 优先读取用户在 cpp-md.mathColor 中配置的颜色
    try {
        const config = vscode.workspace.getConfiguration('cpp-md');
        const customColor = config.get('mathColor');
        if (customColor && customColor !== 'auto' && customColor.trim() !== '') {
            return customColor.trim();
        }
    } catch (e) {
        // ignore
    }

    // 2. 尝试读取用户配置的 editor.tokenColorCustomizations 覆盖的注释颜色
    try {
        const tokenCustoms = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations');
        if (tokenCustoms) {
            if (typeof tokenCustoms.comments === 'string') {
                return tokenCustoms.comments;
            }
            if (Array.isArray(tokenCustoms.textMateRules)) {
                for (const rule of tokenCustoms.textMateRules) {
                    if (rule.scope && (rule.scope === 'comment' || (Array.isArray(rule.scope) && rule.scope.includes('comment')))) {
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

    // 3. 自动匹配主流色彩主题的注释原色
    const themeName = (vscode.workspace.getConfiguration('workbench').get('colorTheme') || '').toLowerCase();

    const themeCommentColors = {
        'default dark+': '#6a9955',    // VS Code 默认暗色主题 (经典 C++ 注释绿)
        'default dark': '#6a9955',
        'visual studio dark': '#6a9955',
        'default light+': '#008000',   // VS Code 默认亮色主题
        'default light': '#008000',
        'visual studio light': '#008000',
        'one dark pro': '#7f848e',     // Atom / One Dark Pro
        'one dark': '#5c6370',
        'dracula': '#6272a4',          // Dracula
        'monokai': '#75715e',          // Monokai
        'monokai pro': '#727072',
        'github dark': '#8b949e',      // GitHub Dark
        'github light': '#6e7681',
        'nord': '#616e88',             // Nord
        'tokyo night': '#565f89',      // Tokyo Night
        'solarized dark': '#586e75',   // Solarized
        'solarized light': '#93a1a1',
        'gruvbox dark': '#928374',     // Gruvbox
        'gruvbox light': '#928374',
        'catppuccin': '#6c7086',       // Catppuccin
        'night owl': '#637777',        // Night Owl
        'material theme': '#546e7a'    // Material Theme
    };

    for (const [name, color] of Object.entries(themeCommentColors)) {
        if (themeName.includes(name)) {
            return color;
        }
    }

    // 4. 默认分类回退
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
        return '#008000';
    }
    return '#6a9955';
}

// --- 2. 静态原子装饰器定义 ---

const hideMathDecoration = vscode.window.createTextEditorDecorationType({ color: 'transparent', fontSize: '0px', letterSpacing: '-1em' });
const hideSyntaxDecoration = vscode.window.createTextEditorDecorationType({ color: 'transparent', fontSize: '0px', letterSpacing: '-1em' });
const mathDecorationType = vscode.window.createTextEditorDecorationType({});

// 独立实线分割线
const hrDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderBottom: '1px solid rgba(128, 128, 128, 0.4)',
    color: 'transparent',
    fontSize: '0px'
});

// 多行代码块整行背框
const codeBlockDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    isWholeLine: true,
    fontFamily: 'monospace'
});

// Markdown 基础文本样式
const h1Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.35em', fontWeight: 'bold' });
const h2Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.2em', fontWeight: 'bold' });
const h3Decoration = vscode.window.createTextEditorDecorationType({ fontSize: '1.1em', fontWeight: 'bold' });

const quoteDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '▌ ', color: 'rgba(128, 128, 128, 0.65)', fontWeight: 'bold' },
    fontStyle: 'italic'
});

const listBulletDecoration = vscode.window.createTextEditorDecorationType({
    before: { contentText: '• ', fontWeight: 'bold', color: 'rgba(128, 128, 128, 0.85)' }
});

const boldDecoration = vscode.window.createTextEditorDecorationType({ fontWeight: 'bold' });
const italicDecoration = vscode.window.createTextEditorDecorationType({ fontStyle: 'italic' });
const strikethroughDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: 'line-through', opacity: '0.65' });
const codeDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    fontFamily: 'monospace'
});

function activate(context) {

    function updateDecorations() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const doc = activeEditor.document;
        const langId = doc.languageId.toLowerCase();
        if (!['cpp', 'c', 'hpp', 'h', 'cc', 'cxx'].includes(langId)) return;

        const activeLine = activeEditor.selection.active.line;

        const h1Ranges = [], h2Ranges = [], h3Ranges = [];
        const boldRanges = [], italicRanges = [], strikeRanges = [];
        const codeRanges = [], codeBlockRanges = [], quoteRanges = [], hrRanges = [], listBulletRanges = [];
        const hideSyntaxRanges = [], hideMathRanges = [];
        const mathRenderOptions = [];

        const protectedLines = new Set();

        // --- STEP 1: 扫描多行代码块 (``` ... ```) ---
        let inFencedCode = false;
        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text;
            if (text.includes('```')) {
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

                if (protectedLines.has(startPos.line)) continue;

                for (let l = startPos.line; l <= endPos.line; l++) {
                    multilineMathLines.add(l);
                }

                const isCursorInFormula = (activeLine >= startPos.line && activeLine <= endPos.line);

                if (!isCursorInFormula) {
                    hideMathRanges.push(new vscode.Range(startPos, endPos));

                    try {
                        const res = texToSvg(rawTex, true, getMathColor());
                        mathRenderOptions.push({
                            range: new vscode.Range(startPos, startPos),
                            renderOptions: {
                                before: {
                                    contentIconPath: vscode.Uri.parse(res.uri),
                                    width: `${res.wEm}em`,
                                    height: `${res.hEm}em`,
                                    verticalAlign: res.va
                                }
                            }
                        });
                    } catch (e) {
                        console.error('[cpp-md] 多行 MathJax 渲染错误:', e);
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

            // A. 分割线 (--- 或 ***)
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
                        const isUnordered = listMatch[1] === '-' || listMatch[1] === '*';
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

                // 1. 公式 ($...$ 或 $$...$$)
                if (texToSvg) {
                    const mathRegex = /(\$\$|\$)(.+?)\1/;
                    const mm = mathRegex.exec(contentStr);
                    if (mm && mm[2].trim()) {
                        candidates.push({
                            type: 'math',
                            index: mm.index,
                            fullLen: mm[0].length,
                            expr: mm[2],
                            isDisplay: mm[1] === '$$'
                        });
                    }
                }

                // 2. 行内代码 (`...`)
                const codeRegex = /(`+)(.+?)\1/;
                const cm = codeRegex.exec(contentStr);
                if (cm) {
                    candidates.push({
                        type: 'code',
                        index: cm.index,
                        fullLen: cm[0].length,
                        inner: cm[2],
                        delimLen: cm[1].length
                    });
                }

                // 3. 粗斜体 (***...***)
                const boldItalicRegex = /\*{3}([\s\S]+?)\*{3}/;
                const bim = boldItalicRegex.exec(contentStr);
                if (bim) {
                    candidates.push({
                        type: 'boldItalic',
                        index: bim.index,
                        fullLen: bim[0].length,
                        inner: bim[1],
                        delimLen: 3
                    });
                }

                // 4. 粗体 (**...**)
                const boldRegex = /(?<!\*)\*{2}([^*][\s\S]*?)\*{2}(?!\*)/;
                const bm = boldRegex.exec(contentStr);
                if (bm) {
                    candidates.push({
                        type: 'bold',
                        index: bm.index,
                        fullLen: bm[0].length,
                        inner: bm[1],
                        delimLen: 2
                    });
                }

                // 5. 斜体 (*...*)
                const italicRegex = /(?<!\*)\*([^*]+?)\*(?!\*)/;
                const im = italicRegex.exec(contentStr);
                if (im) {
                    candidates.push({
                        type: 'italic',
                        index: im.index,
                        fullLen: im[0].length,
                        inner: im[1],
                        delimLen: 1
                    });
                }

                // 6. 删除线 (~~...~~)
                const strikeRegex = /~~([\s\S]+?)~~/;
                const sm = strikeRegex.exec(contentStr);
                if (sm) {
                    candidates.push({
                        type: 'strike',
                        index: sm.index,
                        fullLen: sm[0].length,
                        inner: sm[1],
                        delimLen: 2
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

                if (best.type === 'math') {
                    if (!isCurrentLine && texToSvg) {
                        hideMathRanges.push(new vscode.Range(i, matchStartCol, i, matchEndCol));
                        try {
                            const res = texToSvg(best.expr, best.isDisplay, getMathColor());
                            const startPos = new vscode.Position(i, matchStartCol);

                            mathRenderOptions.push({
                                range: new vscode.Range(startPos, startPos),
                                renderOptions: {
                                    before: {
                                        contentIconPath: vscode.Uri.parse(res.uri),
                                        width: `${res.wEm}em`,
                                        height: `${res.hEm}em`,
                                        verticalAlign: res.va
                                    }
                                }
                            });
                        } catch (e) {
                            console.error('[cpp-md] MathJax 渲染错误:', e);
                        }
                    }
                } else if (best.type === 'code') {
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
                        bold: currentStyles.bold || best.type === 'bold' || best.type === 'boldItalic',
                        italic: currentStyles.italic || best.type === 'italic' || best.type === 'boldItalic',
                        strike: currentStyles.strike || best.type === 'strike'
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

    // 监听配置和主题变更，实时无缝刷新的渲染颜色
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateDecorations),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
                updateDecorations();
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(updateDecorations),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cpp-md.mathColor') || e.affectsConfiguration('workbench.colorTheme')) {
                updateDecorations();
            }
        })
    );

    updateDecorations();
}

function deactivate() {}

module.exports = { activate, deactivate };