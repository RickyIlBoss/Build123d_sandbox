/**
 * Native Apple iOS text selection for the ORIGINAL Monaco editor.
 *
 * Editor.tsx is left exactly as in the original sandbox. This module hooks into
 * every Monaco editor that gets created and, on touch devices only, places a
 * transparent native <textarea> exactly over Monaco's text area. iOS attaches
 * its official selection (blue highlight, teardrop handles, magnifier and the
 * Cut/Copy/Paste callout) to that textarea, while Monaco keeps rendering the
 * code underneath.
 *
 * Every keystroke is forwarded to Monaco's own commands ("type", "deleteLeft",
 * "paste", ...), so auto-closing brackets, Python indentation and every other
 * behavior are exactly Monaco's original behavior.
 */
import { loader } from "@monaco-editor/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = any;

const isTouchDevice = () =>
    typeof window !== "undefined" &&
    ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia?.("(pointer: coarse)").matches);

function offsetToPos(text: string, offset: number) {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            line++;
            lineStart = i + 1;
        }
    }
    return { lineNumber: line, column: offset - lineStart + 1 };
}

function posToOffset(text: string, lineNumber: number, column: number) {
    let line = 1;
    let i = 0;
    while (line < lineNumber && i < text.length) {
        if (text.charCodeAt(i) === 10) line++;
        i++;
    }
    return Math.min(i + column - 1, text.length);
}

function attachOverlay(monaco: AnyEditor, editor: AnyEditor) {
    const container: HTMLElement | null = editor.getContainerDomNode?.();
    const model = editor.getModel?.();
    if (!container || !model) return;
    if (container.querySelector(":scope > .ios-touch-overlay")) return;

    const LF = monaco.editor.EndOfLinePreference.LF;
    const getText = (): string => editor.getModel()?.getValue(LF) ?? "";

    if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
    }

    const ta = document.createElement("textarea");
    ta.className = "ios-touch-overlay";
    ta.setAttribute("wrap", "off");
    ta.setAttribute("spellcheck", "false");
    ta.setAttribute("autocapitalize", "none");
    ta.setAttribute("autocomplete", "off");
    ta.setAttribute("autocorrect", "off");
    ta.setAttribute("aria-hidden", "true");
    ta.value = getText();

    // 16px font avoids iOS auto-zoom; we scale it down to Monaco's real size.
    const BASE_FONT = 16;
    let scale = 1;

    const s = ta.style;
    s.position = "absolute";
    s.margin = "0";
    s.padding = "0";
    s.border = "none";
    s.outline = "none";
    s.resize = "none";
    s.background = "transparent";
    s.color = "transparent";
    s.setProperty("-webkit-text-fill-color", "transparent");
    s.caretColor = "#007aff";
    s.whiteSpace = "pre";
    s.overflowWrap = "normal";
    s.wordBreak = "normal";
    s.overflow = "auto";
    s.boxSizing = "border-box";
    s.borderRadius = "0";
    s.setProperty("-webkit-appearance", "none");
    s.setProperty("-webkit-user-select", "text");
    s.setProperty("-webkit-touch-callout", "default");
    s.userSelect = "text";
    s.transformOrigin = "0 0";
    s.zIndex = "5";
    s.scrollbarWidth = "none";
    s.overscrollBehavior = "contain";

    const layout = () => {
        const info = editor.getLayoutInfo();
        const font = editor.getOption(monaco.editor.EditorOption.fontInfo);
        const tabSize = model.getOptions?.().tabSize ?? 4;
        scale = font.fontSize / BASE_FONT;

        s.left = `${info.contentLeft}px`;
        s.top = "0px";
        s.width = `${info.contentWidth / scale}px`;
        s.height = `${(info.height - (info.horizontalScrollbarHeight || 0)) / scale}px`;
        s.transform = `scale(${scale})`;
        s.fontFamily = font.fontFamily;
        s.fontWeight = String(font.fontWeight);
        s.fontSize = `${BASE_FONT}px`;
        s.lineHeight = `${font.lineHeight / scale}px`;
        s.letterSpacing = `${font.letterSpacing / scale}px`;
        s.fontFeatureSettings = '"liga" 0, "calt" 0';
        s.tabSize = String(tabSize);
        syncScrollFromEditor();
    };

    let scrollFromTextarea = false;
    const syncScrollFromEditor = () => {
        if (scrollFromTextarea) return;
        ta.scrollTop = editor.getScrollTop() / scale;
        ta.scrollLeft = editor.getScrollLeft() / scale;
    };

    ta.addEventListener("scroll", () => {
        scrollFromTextarea = true;
        editor.setScrollTop(ta.scrollTop * scale);
        editor.setScrollLeft(ta.scrollLeft * scale);
        scrollFromTextarea = false;
    });

    // Push the textarea selection into Monaco before running a Monaco command.
    const selectionToEditor = () => {
        const text = ta.value;
        const a = offsetToPos(text, ta.selectionStart);
        const b = offsetToPos(text, ta.selectionEnd);
        editor.setSelection({
            startLineNumber: a.lineNumber,
            startColumn: a.column,
            endLineNumber: b.lineNumber,
            endColumn: b.column,
        });
    };

    // Mirror Monaco's text + cursor back into the textarea.
    const editorToTextarea = () => {
        const text = getText();
        const top = ta.scrollTop;
        const left = ta.scrollLeft;
        if (ta.value !== text) ta.value = text;
        const sel = editor.getSelection();
        if (sel) {
            const start = posToOffset(text, sel.startLineNumber, sel.startColumn);
            const end = posToOffset(text, sel.endLineNumber, sel.endColumn);
            ta.setSelectionRange(start, end);
        }
        ta.scrollTop = top;
        ta.scrollLeft = left;
        // Keep the caret visible like Monaco does.
        if (sel) editor.revealPosition(sel.getPosition());
        syncScrollFromEditor();
    };

    const runMonaco = (fn: () => void) => {
        selectionToEditor();
        fn();
        editorToTextarea();
    };

    ta.addEventListener("beforeinput", (ev: InputEvent) => {
        const type = ev.inputType;
        const data = ev.data ?? ev.dataTransfer?.getData("text/plain") ?? "";

        switch (type) {
            case "insertText":
                if (!data) return;
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "type", { text: data }));
                return;
            case "insertLineBreak":
            case "insertParagraph":
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "type", { text: "\n" }));
                return;
            case "insertFromPaste":
            case "insertFromDrop":
                if (!data) return;
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "paste", { text: data }));
                return;
            case "deleteContentBackward":
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "deleteLeft", null));
                return;
            case "deleteContentForward":
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "deleteRight", null));
                return;
            case "historyUndo":
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "undo", null));
                return;
            case "historyRedo":
                ev.preventDefault();
                runMonaco(() => editor.trigger("keyboard", "redo", null));
                return;
            default:
                // Cut, autocorrect, dictation, composition...: let the textarea
                // change natively, then apply the diff to Monaco in "input".
                return;
        }
    });

    // Fallback: apply any native change (e.g. Cut from the iOS menu) to Monaco.
    let applyingFallback = false;
    ta.addEventListener("input", () => {
        const oldText = getText();
        const newText = ta.value;
        if (oldText === newText) return;

        let start = 0;
        while (
            start < oldText.length &&
            start < newText.length &&
            oldText[start] === newText[start]
        ) {
            start++;
        }
        let endOld = oldText.length;
        let endNew = newText.length;
        while (
            endOld > start &&
            endNew > start &&
            oldText[endOld - 1] === newText[endNew - 1]
        ) {
            endOld--;
            endNew--;
        }

        const a = offsetToPos(oldText, start);
        const b = offsetToPos(oldText, endOld);
        const selStart = ta.selectionStart;
        const selEnd = ta.selectionEnd;

        applyingFallback = true;
        editor.pushUndoStop();
        editor.executeEdits("ios-touch-overlay", [
            {
                range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
                text: newText.slice(start, endNew),
                forceMoveMarkers: true,
            },
        ]);
        editor.pushUndoStop();
        applyingFallback = false;

        ta.setSelectionRange(selStart, selEnd);
        selectionToEditor();
    });

    // Hardware keyboard Tab -> Monaco indentation.
    ta.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Tab") {
            ev.preventDefault();
            runMonaco(() =>
                editor.trigger(
                    "keyboard",
                    ev.shiftKey ? "outdent" : "tab",
                    null,
                ),
            );
        }
    });

    // External changes (Run/URL load/theme etc.) -> textarea.
    const d1 = editor.onDidChangeModelContent(() => {
        if (applyingFallback) return;
        if (ta.value !== getText()) {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            ta.value = getText();
            if (document.activeElement === ta) ta.setSelectionRange(start, end);
        }
    });
    const d2 = editor.onDidScrollChange(syncScrollFromEditor);
    const d3 = editor.onDidLayoutChange(layout);
    const d4 = editor.onDidChangeConfiguration(layout);

    container.appendChild(ta);
    layout();
    // Fonts may finish loading after creation.
    setTimeout(layout, 300);
    document.fonts?.ready.then(layout).catch(() => {});

    editor.onDidDispose(() => {
        d1.dispose();
        d2.dispose();
        d3.dispose();
        d4.dispose();
        ta.remove();
    });
}

if (isTouchDevice()) {
    loader
        .init()
        .then((monaco: AnyEditor) => {
            monaco.editor.onDidCreateEditor((editor: AnyEditor) => {
                const tryAttach = () => {
                    if (editor.getModel()) {
                        attachOverlay(monaco, editor);
                    } else {
                        const d = editor.onDidChangeModel(() => {
                            d.dispose();
                            attachOverlay(monaco, editor);
                        });
                    }
                };
                setTimeout(tryAttach, 0);
            });
        })
        .catch(() => {});
}
