import { App, MarkdownRenderer, Component, TFile } from 'obsidian';

/**
 * Render Obsidian Markdown to WeChat-compatible HTML with completely inlined styles.
 * This function renders the markdown using Obsidian's native engine to achieve 100% 
 * fidelity with the user's active theme, and then inlines all computed CSS properties.
 */
export interface RenderOptions {
    removeFirstImage?: boolean;
    imageStyles?: {
        borderRadius?: string;
        boxShadow?: string;
        borderColor?: string;
        borderThickness?: string;
    };
    template?: {
        headingFontSize?: string;
        headingColor?: string;
        textFontSize?: string;
        marginTop?: string;
        marginBottom?: string;
        lineHeight?: string;
        paddingSide?: string;
    };
}

/**
 * Processes markdown string to preserve multiple consecutive manual line breaks.
 * Obsidian's native parser normally collapses multiple empty lines.
 * This function injects <br> tags for extra empty lines while ignoring code and math blocks.
 */
export function preserveMultipleNewlines(md: string): string {
    let isInsideCodeBlock = false;
    let isInsideMathBlock = false;
    const lines = md.split('\n');
    const processedLines = [];
    let emptyLineCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('```')) {
            isInsideCodeBlock = !isInsideCodeBlock;
        }
        if (trimmedLine === '$$') {
            isInsideMathBlock = !isInsideMathBlock;
        }

        if (!isInsideCodeBlock && !isInsideMathBlock && trimmedLine === '') {
            emptyLineCount++;
            if (emptyLineCount >= 1) {
                processedLines.push('<p><br class="ProseMirror-trailingBreak"></p>');
                processedLines.push(''); // Ensure the HTML block is closed by adding a blank line
            }
        } else {
            emptyLineCount = 0;
            processedLines.push(line);
        }
    }
    return processedLines.join('\n');
}

export async function renderToWeChatHtml(app: App, content: string, sourceFile: TFile, options: RenderOptions = {}): Promise<{ html: string; firstImageUrl: string | null }> {
    const wrapper = document.createElement('div');
    // Force mobile layout width to ensure styling exactly matches the preview
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.width = '375px';
    wrapper.style.visibility = 'hidden';
    wrapper.addClass('markdown-reading-view', 'markdown-preview-view', 'markdown-rendered');

    // Must append to body for getComputedStyle to work correctly
    document.body.appendChild(wrapper);

    const component = new Component();
    component.load();

    // Strip frontmatter before rendering
    let md = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    md = preserveMultipleNewlines(md);

    await MarkdownRenderer.render(app, md, wrapper, sourceFile.path, component);

    // Wait a short tick for asynchronous rendering (e.g. plugins, Callouts, or images)
    await new Promise(resolve => setTimeout(resolve, 300));

    let firstImageUrl: string | null = null;
    const firstImg = wrapper.querySelector('img, .internal-embed');
    if (firstImg) {
        if (firstImg.tagName === 'IMG') {
            firstImageUrl = (firstImg as HTMLImageElement).src;
        } else {
            // internal-embed sometimes has a src attribute
            firstImageUrl = firstImg.getAttribute('src');
        }
    }

    // Remove first image if it's used as a cover
    if (options.removeFirstImage && firstImg) {
        const p = firstImg.closest('p, .image-embed, .markdown-embed');
        if (p && p.parentElement === wrapper && p.textContent?.trim() === '') {
            p.remove();
        } else {
            firstImg.remove();
        }
    }

    // Pre-process: Wrap any root-level <br> elements in <p> to prevent WeChat from stripping them
    // WeChat's editor often discards standalone <br> elements that sit between block elements
    // with explicit margins. Wrapping them in <p> lets our isSpacer logic protect them.
    Array.from(wrapper.childNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
            const p = document.createElement('p');
            node.parentNode?.insertBefore(p, node);
            p.appendChild(node);
        }
    });

    // Pre-process: Split <p> tags containing <br> into separate <p> tags
    // This replicates WeChat editor's native behavior where each soft line break is a distinct structural paragraph
    const paragraphsWithBr = Array.from(wrapper.querySelectorAll('p')).filter(p => !p.closest('li') && p.querySelector('br'));
    paragraphsWithBr.forEach(p => {
        // Only split if the <p> actually contains standard text, avoid splitting spacer paragraphs
        if (p.textContent?.trim() === '' && !p.querySelector('img, .internal-embed')) return;

        const htmlPieces = p.innerHTML.split(/<br[^>]*>/i);
        if (htmlPieces.length > 1) {
            const frag = document.createDocumentFragment();
            htmlPieces.forEach(piece => {
                const newP = document.createElement('p');
                Array.from(p.attributes).forEach(attr => newP.setAttribute(attr.name, attr.value));
                if (piece.trim() === '') {
                    newP.innerHTML = '&nbsp;'; // Preserve empty lines natively for WeChat
                } else {
                    newP.innerHTML = piece;
                }
                frag.appendChild(newP);
            });
            p.replaceWith(frag);
        }
    });

    try {
        const fs = require('fs');
        fs.writeFileSync('/tmp/wechat_raw_obsidian.html', wrapper.innerHTML, 'utf-8');
    } catch (e) { }

    // Pre-process: Unwrap <p> inside <li> to prevent WeChat from introducing extra line breaks
    // (Obsidian puts block text inside paragraphs within ordered/unordered lists)
    const listParagraphs = wrapper.querySelectorAll('li > p');
    listParagraphs.forEach(p => {
        const parent = p.parentElement;
        if (parent) {
            while (p.firstChild) {
                parent.insertBefore(p.firstChild, p);
            }
            parent.removeChild(p);
        }
    });

    // Define properties to inline. We skip sizing because it can break WeChat logic,
    // but include all typography, colors, borders, and backgrounds.
    const computedProps = [
        'color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family',
        'text-decoration', 'text-align',
        'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'line-height', 'display', 'flex-direction', 'justify-content', 'align-items',
        'box-shadow', 'opacity'
    ];

    function applyInlineStyles(node: HTMLElement) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR' || (node.tagName === 'SPAN' && node.hasAttribute('leaf'))) {
                node.removeAttribute('style');
                Array.from(node.children).forEach(child => (child as HTMLElement).removeAttribute?.('style'));
                return;
            }

            const style = window.getComputedStyle(node);
            const inlineStyles: Record<string, string> = {};

            for (const prop of computedProps) {
                // Always inline typography properties to guarantee exact fidelity, 
                // preventing WeChat client from overriding <p> with its 17px default.

                const val = style.getPropertyValue(prop);
                // Skip default/empty values to reduce HTML payload size
                if (val && val !== 'rgba(0, 0, 0, 0)' && val !== '0px' && val !== 'none' && val !== 'normal') {
                    inlineStyles[prop] = val;
                }
            }

            // Global Template styles
            if (options.template) {
                const { headingFontSize, headingColor, textFontSize, marginTop, marginBottom, lineHeight, paddingSide } = options.template;

                // Headings
                if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
                    if (headingFontSize) inlineStyles['font-size'] = headingFontSize;
                    if (headingColor) inlineStyles['color'] = headingColor;
                    if (marginTop) inlineStyles['margin-top'] = marginTop;
                    if (marginBottom) inlineStyles['margin-bottom'] = marginBottom;
                    if (lineHeight) inlineStyles['line-height'] = lineHeight;
                    if (paddingSide && paddingSide !== '0px') {
                        inlineStyles['padding-left'] = paddingSide;
                        inlineStyles['padding-right'] = paddingSide;
                    }
                }

                // Text/Paragraph elements
                if (node.tagName === 'P') {
                    // Detect empty spacer paragraphs intended as blank lines
                    const isSpacer = node.textContent?.trim() === '' && Array.from(node.children).every(c => c.tagName === 'BR' || c.tagName === 'SPAN') && !node.querySelector('img, .internal-embed');

                    if (marginTop) inlineStyles['margin-top'] = marginTop;
                    if (marginBottom) inlineStyles['margin-bottom'] = marginBottom;

                    if (isSpacer) {
                        node.innerHTML = '&nbsp;';
                    }

                    if (textFontSize) inlineStyles['font-size'] = textFontSize;
                    if (lineHeight) inlineStyles['line-height'] = lineHeight;
                    if (paddingSide && paddingSide !== '0px') {
                        inlineStyles['padding-left'] = paddingSide;
                        inlineStyles['padding-right'] = paddingSide;
                    }
                }

                if (node.tagName === 'LI') {
                    if (textFontSize) inlineStyles['font-size'] = textFontSize;
                    if (lineHeight) inlineStyles['line-height'] = lineHeight;
                    if (paddingSide && paddingSide !== '0px') {
                        inlineStyles['padding-left'] = paddingSide;
                        inlineStyles['padding-right'] = paddingSide;
                    }
                }
            }

            // Synthesize blockquote/container borders (WeChat requires shorthand for borders)
            const borders = ['top', 'right', 'bottom', 'left'];
            for (const b of borders) {
                const width = style.getPropertyValue(`border-${b}-width`);
                const bStyle = style.getPropertyValue(`border-${b}-style`);
                const color = style.getPropertyValue(`border-${b}-color`);
                if (width && width !== '0px' && bStyle && bStyle !== 'none') {
                    inlineStyles[`border-${b}`] = `${width} ${bStyle} ${color}`;
                }
            }

            // Handle list styles specifically
            if (node.tagName === 'LI' || node.tagName === 'UL' || node.tagName === 'OL') {
                const listStyle = style.getPropertyValue('list-style-type');
                if (listStyle && listStyle !== 'none') {
                    inlineStyles['list-style-type'] = listStyle;
                }
            }

            // Handle quotes - converted to raw div to avoid WeChat's aggressive default blockquote styling
            if (node.tagName === 'BLOCKQUOTE') {
                // Clear any inherited flex layout junk that causes WeChat to discard the style attribute
                delete inlineStyles['display'];
                delete inlineStyles['flex-direction'];
                delete inlineStyles['justify-content'];
                delete inlineStyles['align-items'];

                // Hardcode standard margins and padding for quotes instead of inheriting potentially huge margin-left
                inlineStyles['margin'] = '15px 0';
                inlineStyles['padding'] = '10px 15px';
                inlineStyles['display'] = 'block';
                inlineStyles['box-sizing'] = 'border-box';
                delete inlineStyles['margin-top'];
                delete inlineStyles['margin-bottom'];
                delete inlineStyles['margin-left'];
                delete inlineStyles['margin-right'];

                const bg = style.getPropertyValue('background-color');
                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                    inlineStyles['background-color'] = bg;
                } else {
                    delete inlineStyles['background-color'];
                }

                // NOTE: getPropertyValue('border-left') never works (browsers don't return shorthand)
                // Must read individual sub-properties.
                const bWidth = style.getPropertyValue('border-left-width');
                const bStyle2 = style.getPropertyValue('border-left-style');
                const bColor = style.getPropertyValue('border-left-color');

                if (bWidth && bWidth !== '0px' && bStyle2 && bStyle2 !== 'none' && bColor !== 'rgba(0, 0, 0, 0)' && bColor !== 'transparent') {
                    // Direct border found from theme
                    inlineStyles['border-left'] = `${bWidth} ${bStyle2} ${bColor}`;
                } else {
                    // Check ::before pseudo-element (many Obsidian themes use it for the coloured bar)
                    const beforeStyle = window.getComputedStyle(node, '::before');
                    const beforeBg = beforeStyle.getPropertyValue('background-color');
                    const beforeW = beforeStyle.getPropertyValue('width');
                    if (beforeBg && beforeBg !== 'rgba(0, 0, 0, 0)' && beforeBg !== 'transparent') {
                        const px = Math.round(parseFloat(beforeW)) || 4;
                        inlineStyles['border-left'] = `${px}px solid ${beforeBg}`;
                    } else {
                        // Hard fallback: use the accent colour variable from the document root
                        let accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
                            || getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();

                        // WeChat doesn't support var() in inline styles
                        if (!accentColor || accentColor.includes('var(')) {
                            accentColor = '#ffa900';
                        }
                        inlineStyles['border-left'] = `4px solid ${accentColor}`;
                    }
                }
            }

            // Handle paragraphs inside lists (should be unwrapped now, but just in case)
            if (node.tagName === 'P' && node.parentElement && ['LI', 'UL', 'OL'].includes(node.parentElement.tagName)) {
                inlineStyles['display'] = 'inline';
                inlineStyles['margin'] = '0';
                inlineStyles['padding'] = '0';
            }

            // Clean up margins for elements directly inside blockquotes
            if (node.parentElement && node.parentElement.tagName === 'BLOCKQUOTE') {
                if (node === node.parentElement.firstElementChild) {
                    delete inlineStyles['margin-top'];
                }
                if (node === node.parentElement.lastElementChild) {
                    delete inlineStyles['margin-bottom'];
                }
            }

            // Ensure exact list item spacing
            if (node.tagName === 'LI') {
                inlineStyles['margin'] = '0.5em 0';
                inlineStyles['padding'] = '0';
            }

            // Handle images
            if (node.tagName === 'IMG' && options.imageStyles) {
                const { borderRadius, boxShadow, borderColor, borderThickness } = options.imageStyles;
                if (borderRadius && borderRadius !== '0px') inlineStyles['border-radius'] = borderRadius;
                if (boxShadow && boxShadow !== 'none') inlineStyles['box-shadow'] = boxShadow;
                if (borderThickness && borderThickness !== '0px' && borderColor) {
                    inlineStyles['border'] = `${borderThickness} solid ${borderColor}`;
                }
            }

            let css = '';
            for (const key in inlineStyles) {
                css += `${key}: ${inlineStyles[key]}; `;
            }

            node.setAttribute('style', css);

            // Clean up obsidian-specific attributes to avoid WeChat filtering issues
            node.removeAttribute('class');
            node.removeAttribute('id');
            node.removeAttribute('data-callout');
            node.removeAttribute('data-tag-name');
            node.removeAttribute('dir');
        }

        Array.from(node.children).forEach(child => applyInlineStyles(child as HTMLElement));
    }

    applyInlineStyles(wrapper);

    // After inline styles are applied, swap BLOCKQUOTE tags for SECTION tags 
    // to bypass WeChat's forced blockquote rendering logic completely.
    const blockquotes = wrapper.querySelectorAll('blockquote');
    blockquotes.forEach(bq => {
        const section = document.createElement('section');
        section.innerHTML = bq.innerHTML;
        section.setAttribute('style', bq.getAttribute('style') || '');
        bq.replaceWith(section);
    });

    // Convert OL/UL lists to div-based layout to bypass WeChat API's broken list rendering.
    // WeChat's draft API mangles <ol>/<li> by inserting empty rows between items.
    // We replicate the visual look using CSS counter and divs instead.
    const convertListToDiv = (list: Element, isOrdered: boolean, startIndex: number): HTMLElement => {
        const containerDiv = document.createElement('div');
        // Inherit font-size/color from the list element itself
        const listStyle = list.getAttribute('style') || '';
        containerDiv.setAttribute('style', listStyle);

        let counter = startIndex;
        Array.from(list.children).forEach(item => {
            if (item.tagName === 'LI') {
                const rowDiv = document.createElement('div');
                // Inherit the li's own style (font-size, color, line-height etc.)
                const liStyle = item.getAttribute('style') || '';
                rowDiv.setAttribute('style', `display: flex; align-items: baseline; margin: 0.3em 0; padding: 0; ${liStyle}`);

                const bulletSpan = document.createElement('span');
                // Do NOT override font-weight — let it inherit naturally from liStyle
                bulletSpan.setAttribute('style', 'display: inline-block; min-width: 1.8em; flex-shrink: 0;');
                if (isOrdered) {
                    bulletSpan.textContent = `${counter}.`;
                    counter++;
                } else {
                    bulletSpan.textContent = '•';
                }

                const contentSpan = document.createElement('span');
                contentSpan.setAttribute('style', 'flex: 1;');
                contentSpan.innerHTML = item.innerHTML;

                rowDiv.appendChild(bulletSpan);
                rowDiv.appendChild(contentSpan);
                containerDiv.appendChild(rowDiv);
            } else if (['UL', 'OL'].includes(item.tagName)) {
                const nestedDiv = convertListToDiv(item, item.tagName === 'OL', 1);
                nestedDiv.style.paddingLeft = '1.5em';
                containerDiv.appendChild(nestedDiv);
            }
        });
        return containerDiv;
    };

    // Convert all top-level and nested lists (process deepest first to handle nesting)
    const allLists = Array.from(wrapper.querySelectorAll('ol, ul'));
    // Process innermost lists first (bottom-up)
    allLists.reverse().forEach(list => {
        if (['OL', 'UL'].includes(list.tagName)) {
            const isOrdered = list.tagName === 'OL';
            const startAttr = (list as HTMLOListElement).start || 1;
            const divList = convertListToDiv(list, isOrdered, startAttr);
            list.replaceWith(divList);
        }
    });

    // Clean up leading spaces from text nodes natively in the DOM before extracting innerHTML
    const cleanLeadingSpaces = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const prev = node.previousSibling;
            const parent = node.parentElement;
            const isPrevLineBreak = prev && (prev.nodeName === 'BR' || (prev.nodeName === 'SPAN' && (prev as HTMLElement).style.display === 'block'));

            if (isPrevLineBreak || (!prev && parent && ['P', 'LI', 'DIV'].includes(parent.tagName))) {
                node.textContent = (node.textContent || '').replace(/^[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '');
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            Array.from(node.childNodes).forEach(cleanLeadingSpaces);
        }
    };
    cleanLeadingSpaces(wrapper);

    let resultHtml = wrapper.innerHTML
        // Remove trailing spaces before </p>, EXCEPT if preceded by a <br>. 
        // A trailing <br> needs the \n text node to remain visible as an empty line in HTML.
        .replace(/(<br[^>]*>)?\s+<\/p>/gi, (match, br) => br ? match : '</p>');

    // Final WeChat API Formatting: Replicate perfectly the ProseMirror native output from WeChat
    resultHtml = resultHtml.replace(/<p([^>]*)>(.*?)<\/p>/gi, (match, attrs, content) => {
        if (content.match(/<img/i) || content.match(/<iframe/i) || content.match(/<video/i)) {
            return match; // Don't alter media paragraphs
        }

        // Strip out tags and whitespaces to check if the line is functionally empty
        const textOnly = content.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/gi, '');
        const isSpacer = textOnly === '';

        if (isSpacer) {
            // Exactly replicates a manual empty line return in WeChat's editor
            return `<p${attrs}><span leaf=""><br class="ProseMirror-trailingBreak"></span></p>`;
        } else {
            // Replicates the trailing break appended to non-empty paragraphs in WeChat's editor
            let finalContent = content;
            if (!finalContent.includes('ProseMirror-trailingBreak')) {
                finalContent += '<span leaf=""><br class="ProseMirror-trailingBreak"></span>';
            }
            return `<p${attrs}>${finalContent}</p>`;
        }
    });

    try {
        const fs = require('fs');
        fs.writeFileSync('/tmp/wechat_styled_obsidian.html', resultHtml, 'utf-8');
    } catch (e) { }

    // Cleanup
    component.unload();
    wrapper.remove();

    return {
        html: `<section style="max-width:100%;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:12px;">${resultHtml}</section>`,
        firstImageUrl
    };
}
