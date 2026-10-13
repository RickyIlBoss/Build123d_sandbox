import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TerminalIcon from "@mui/icons-material/Terminal";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ShareIcon from "@mui/icons-material/Share";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MonacoEditor from "@monaco-editor/react";
import PythonOutput from "../PythonOutput.tsx";
import Viewer from "../Viewer.tsx";
import Toast from "../Toast.tsx";
import { compressCode, updateUrlWithCode } from "../../utils/urlCodec.ts";
import type { ThemeMode } from "../../theme.ts";

type MobileView = "viewer" | "code" | "output";
type MobileAction = MobileView | "run";

interface MobileLayoutProps {
    modelData?: string;
    stdout: string;
    stderr: string;
    isRunning: boolean;
    isReady: boolean;
    code: string;
    setCode: (code: string) => void;
    runCode: (code: string) => Promise<void>;
    downloadExport: (format: string, currentCode?: string) => Promise<boolean>;
    theme: ThemeMode;
    onToggleMode: () => void;
}

const EXPORT_FORMATS = ["STEP", "STL", "3MF", "SVG", "DXF", "BREP"];

function MobileLayout(props: MobileLayoutProps) {
    const [mobileView, setMobileView] = useState<MobileView>("viewer");
    // Percentage of container occupied by the code sheet (default ~48% matching the screenshot)
    const [sheetHeightPercentage, setSheetHeightPercentage] = useState(48);
    const [isDragging, setIsDragging] = useState(false);

    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    // More options menu anchor
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

    // Toast notification state
    const [toastMessage, setToastMessage] = useState("");
    const [showToast, setShowToast] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const hasError = Boolean(props.stderr && props.stderr.trim().length > 0);

    // Track when virtual keyboard opens/closes to allow natural scroll space at bottom
    useEffect(() => {
        const vv = window.visualViewport;

        const isInputElement = (el: Element | null): boolean => {
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            return (
                tag === "input" ||
                tag === "textarea" ||
                el.classList.contains("inputarea")
            );
        };

        const ensureScrollReset = () => {
            const doReset = () => {
                if (window.scrollY !== 0) {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                }
                if (document.documentElement && document.documentElement.scrollTop !== 0) {
                    document.documentElement.scrollTop = 0;
                }
                if (document.body && document.body.scrollTop !== 0) {
                    document.body.scrollTop = 0;
                }
                if (containerRef.current && containerRef.current.scrollTop !== 0) {
                    containerRef.current.scrollTop = 0;
                }
                const rootEl = document.getElementById("root");
                if (rootEl && rootEl.scrollTop !== 0) {
                    rootEl.scrollTop = 0;
                }
            };

            doReset();
            requestAnimationFrame(doReset);
            setTimeout(doReset, 40);
            setTimeout(doReset, 120);
            setTimeout(doReset, 250);
            setTimeout(doReset, 400);
        };

        let prevKb = false;
        const updateViewport = () => {
            if (!vv) return;
            const currentHeight = vv.height;
            const isKb = currentHeight < window.innerHeight - 120;
            setIsKeyboardOpen(isKb);
            if (prevKb && !isKb) {
                // Virtual keyboard was just dismissed!
                if (isInputElement(document.activeElement)) {
                    (document.activeElement as HTMLElement)?.blur?.();
                }
                ensureScrollReset();
            }
            prevKb = isKb;
        };

        if (vv) {
            vv.addEventListener("resize", updateViewport);
            vv.addEventListener("scroll", updateViewport);
        }

        const handleFocusIn = (e: FocusEvent) => {
            if (isInputElement(e.target as Element)) {
                setIsKeyboardOpen(true);
            }
        };

        const handleFocusOut = () => {
            setTimeout(() => {
                if (!isInputElement(document.activeElement)) {
                    setIsKeyboardOpen(false);
                    ensureScrollReset();
                }
            }, 40);
        };

        window.addEventListener("focusin", handleFocusIn);
        window.addEventListener("focusout", handleFocusOut);

        return () => {
            if (vv) {
                vv.removeEventListener("resize", updateViewport);
                vv.removeEventListener("scroll", updateViewport);
            }
            window.removeEventListener("focusin", handleFocusIn);
            window.removeEventListener("focusout", handleFocusOut);
        };
    }, []);

    const dragStartYRef = useRef(0);
    const dragStartPercentageRef = useRef(sheetHeightPercentage);
    const dragTotalHeightRef = useRef(0);

    // --- Drag physics for the bottom sheet ---
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragStartYRef.current = e.clientY;
        dragStartPercentageRef.current = sheetHeightPercentage;
        dragTotalHeightRef.current = containerRef.current?.offsetHeight || window.innerHeight;
        setIsDragging(true);
    }, [sheetHeightPercentage]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length > 0) {
            if (e.cancelable) e.preventDefault();
            dragStartYRef.current = e.touches[0].clientY;
            dragStartPercentageRef.current = sheetHeightPercentage;
            dragTotalHeightRef.current = containerRef.current?.offsetHeight || window.innerHeight;
            setIsDragging(true);
        }
    }, [sheetHeightPercentage]);

    useEffect(() => {
        if (!isDragging) return;

        const updatePosition = (clientY: number) => {
            const totalH = dragTotalHeightRef.current || window.innerHeight || 600;
            const deltaY = clientY - dragStartYRef.current;
            // Moving finger up (negative deltaY) increases the bottom sheet percentage
            const deltaPercentage = -(deltaY / totalH) * 100;
            const target = dragStartPercentageRef.current + deltaPercentage;
            // Clamp between 14% (almost collapsed, header only) and 86% (maximum code view)
            const clamped = Math.max(14, Math.min(86, target));
            setSheetHeightPercentage(clamped);
        };

        const onMouseMove = (e: MouseEvent) => {
            updatePosition(e.clientY);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                // Prevent browser rubber-banding/scroll while dragging the handle
                if (e.cancelable) {
                    e.preventDefault();
                }
                updatePosition(e.touches[0].clientY);
            }
        };

        const onEnd = () => {
            setIsDragging(false);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onEnd);
        window.addEventListener("touchcancel", onEnd);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onEnd);
            window.removeEventListener("touchcancel", onEnd);
        };
    }, [isDragging]);

    // --- Action Handlers ---
    const lastRunTimeRef = useRef(0);
    const handleRunClick = async () => {
        const now = Date.now();
        if (now - lastRunTimeRef.current < 400) return;
        lastRunTimeRef.current = now;
        if (!props.isReady || props.isRunning) return;
        await props.runCode(props.code);
    };

    const handleShareClick = () => {
        setMenuAnchor(null);
        const compressed = compressCode(props.code);
        const testUrl = new URL(window.location.href);
        testUrl.searchParams.set("code", compressed);

        if (testUrl.toString().length > 6000) {
            setToastMessage("Code too long for URL sharing.");
            setShowToast(true);
            return;
        }

        updateUrlWithCode(props.code);
        navigator.clipboard
            .writeText(window.location.href)
            .then(() => {
                setToastMessage("URL copied to clipboard!");
                setShowToast(true);
            })
            .catch(() => {
                setToastMessage("Failed to copy URL");
                setShowToast(true);
            });
    };

    const handleDownloadFormat = async (format: string) => {
        setExportAnchor(null);
        setMenuAnchor(null);
        const success = await props.downloadExport(format, props.code);
        if (!success) {
            setToastMessage(`Export as ${format} failed. Make sure to run the code first.`);
            setShowToast(true);
        } else {
            setToastMessage(`Exported as ${format}!`);
            setShowToast(true);
        }
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                minHeight: "100vh",
                bgcolor: "background.default",
                overflowX: "hidden",
                touchAction: "pan-y",
                pb: 0,
            }}
        >
            {/* MAIN CONTENT AREA */}
            {mobileView === "output" ? (
                <Box
                    sx={{
                        flex: 1,
                        minHeight: "100dvh",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    {/* Terminal Header with Back Button */}
                    <Box
                        sx={{
                            height: 48,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            px: 1.5,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            bgcolor: "background.paper",
                            flexShrink: 0,
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <IconButton
                                size="small"
                                onClick={() => setMobileView("viewer")}
                                sx={{ color: "text.primary" }}
                                title="Torna al modello"
                            >
                                <ArrowBackIcon fontSize="small" />
                            </IconButton>
                            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                                Terminale
                            </Typography>
                            {hasError && (
                                <Box
                                    sx={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        bgcolor: "#ef4444",
                                    }}
                                />
                            )}
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setMobileView("viewer")}
                            sx={{
                                textTransform: "none",
                                fontSize: "13px",
                                py: 0.25,
                                px: 1.5,
                                borderRadius: "8px",
                            }}
                        >
                            Chiudi
                        </Button>
                    </Box>
                    <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                        <PythonOutput
                            stdout={props.stdout}
                            stderr={props.stderr}
                            isRunning={props.isRunning}
                        />
                    </Box>
                </Box>
            ) : (
                /* VIEWER + DRAGGABLE CODE SHEET */
                <Box
                    ref={containerRef}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        position: "relative",
                        userSelect: isDragging ? "none" : "auto",
                    }}
                >
                    {/* TOP: 3D CAD VIEWER (OCP) */}
                    <Box
                        sx={{
                            height: `${100 - sheetHeightPercentage}vh`,
                            minHeight: "180px",
                            width: "100%",
                            position: "relative",
                            overflow: "hidden",
                            zIndex: 1,
                            pointerEvents: isDragging ? "none" : "auto",
                            transition: "none",
                        }}
                    >
                        <Viewer
                            modelData={props.modelData}
                            treeWidth={0}
                            theme={props.theme}
                        />
                    </Box>

                    {/* MIDDLE: DRAGGABLE HANDLE ("LA TENDINA") */}
                    <Box
                        sx={{
                            height: "26px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            bgcolor: "background.default",
                            position: "relative",
                            zIndex: 30,
                        }}
                    >
                        {/* Only this centered target is draggable */}
                        <Box
                            onMouseDown={handleDragStart}
                            onTouchStart={handleTouchStart}
                            sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 56,
                                height: "100%",
                                cursor: "row-resize",
                                touchAction: "none",
                                userSelect: "none",
                                WebkitUserSelect: "none",
                            }}
                        >
                            {/* The horizontal gray pill */}
                            <Box
                                sx={{
                                    width: 38,
                                    height: 4.5,
                                    borderRadius: "3px",
                                    bgcolor: isDragging
                                        ? props.theme === "dark"
                                            ? "rgba(255, 255, 255, 0.72)"
                                            : "#334155"
                                        : props.theme === "dark"
                                            ? "rgba(255, 255, 255, 0.28)"
                                            : "#cbd5e1",
                                    transition: isDragging
                                        ? "none"
                                        : "background-color 0.15s ease",
                                }}
                            />
                        </Box>
                    </Box>

                    {/* BOTTOM: THE CODE CARD (Rounded card matching the screenshot) */}
                    <Box
                        sx={{
                            height: `calc(${sheetHeightPercentage}vh - 26px)`,
                            minHeight: "220px",
                            px: "10px",
                            pb: "calc(52px + env(safe-area-inset-bottom, 20px))",
                            display: "flex",
                            flexDirection: "column",
                            touchAction: "pan-y",
                            transition: "none",
                        }}
                    >
                        <Paper
                            variant="outlined"
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                borderRadius: "12px",
                                overflow: "hidden",
                                bgcolor: "background.paper",
                                borderColor: "divider",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                            }}
                        >
                            {/* Card Header: </> cube.py                     ▶   ... */}
                            <Box
                                sx={{
                                    height: "44px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    px: 1.5,
                                    flexShrink: 0,
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: "background.paper",
                                    touchAction: "pan-y",
                                }}
                            >
                                {/* Left: Arrows icon </> and file name */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        userSelect: "none",
                                        pointerEvents: "none",
                                    }}
                                >
                                    <Typography
                                        component="span"
                                        sx={{
                                            color: "primary.main",
                                            fontFamily: "monospace",
                                            fontWeight: 800,
                                            fontSize: "16px",
                                            lineHeight: 1,
                                            letterSpacing: "-0.5px",
                                            display: "inline-flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        &lt;/&gt;
                                    </Typography>
                                    <Typography
                                        component="span"
                                        sx={{
                                            fontWeight: 600,
                                            fontSize: "14px",
                                            color: "text.primary",
                                            letterSpacing: "-0.2px",
                                        }}
                                    >
                                        cube.py
                                    </Typography>
                                </Box>

                                {/* Right: Play button ▶ and More button ... */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                    }}
                                >
                                    <IconButton
                                        disableRipple
                                        size="small"
                                        onClick={handleRunClick}
                                        onMouseDown={(e) => {
                                            // Prevent focus loss from editor on desktop/mouse
                                            e.preventDefault();
                                        }}
                                        onTouchStart={(e) => {
                                            // Prevent keyboard dismissal on iOS/Android touch
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRunClick();
                                        }}
                                        disabled={!props.isReady || props.isRunning}
                                        title="Run Code"
                                        sx={{
                                            color: "text.secondary",
                                            p: 0.75,
                                            transition: "transform 0.08s, opacity 0.08s",
                                            "&:hover": {
                                                bgcolor: "transparent",
                                                color: "text.primary",
                                            },
                                            "&:active": {
                                                transform: "scale(0.92)",
                                                opacity: 0.6,
                                                bgcolor: "transparent",
                                            },
                                            "&.Mui-focusVisible": {
                                                bgcolor: "transparent",
                                            },
                                        }}
                                    >
                                        {props.isRunning ? (
                                            <CircularProgress
                                                size={18}
                                                sx={{ color: "text.secondary" }}
                                            />
                                        ) : (
                                            <PlayArrowIcon sx={{ fontSize: 21 }} />
                                        )}
                                    </IconButton>

                                    <IconButton
                                        disableRipple
                                        size="small"
                                        onClick={(e) => setMenuAnchor(e.currentTarget)}
                                        title="Opzioni"
                                        sx={{
                                            color: "text.secondary",
                                            p: 0.75,
                                            transition: "transform 0.08s, opacity 0.08s",
                                            "&:hover": {
                                                bgcolor: "transparent",
                                                color: "text.primary",
                                            },
                                            "&:active": {
                                                transform: "scale(0.92)",
                                                opacity: 0.6,
                                                bgcolor: "transparent",
                                            },
                                            "&.Mui-focusVisible": {
                                                bgcolor: "transparent",
                                            },
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                position: "relative",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            <MoreHorizIcon sx={{ fontSize: 21 }} />
                                            {hasError && (
                                                <Box
                                                    sx={{
                                                        position: "absolute",
                                                        top: -2,
                                                        right: -3,
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: "50%",
                                                        bgcolor: "#ef4444",
                                                    }}
                                                />
                                            )}
                                        </Box>
                                    </IconButton>
                                </Box>
                            </Box>

                            {/* Card Body: Monaco Editor with iOS touch selection */}
                            <Box
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    position: "relative",
                                    overflow: "hidden",
                                }}
                            >
                                <MonacoEditor
                                    height="100%"
                                    language="python"
                                    theme={props.theme === "dark" ? "vs-dark" : "light"}
                                    value={props.code}
                                    onChange={(val) => props.setCode(val || "")}
                                    options={{
                                        minimap: { enabled: false },
                                        lineNumbers: "on",
                                        lineNumbersMinChars: 3,
                                        glyphMargin: false,
                                        folding: false,
                                        lightbulb: { enabled: false },
                                        quickSuggestions: false,
                                        lineDecorationsWidth: 6,
                                        wordWrap: "off",
                                        fontSize: 12.5,
                                        lineHeight: 18,
                                        fontFamily:
                                            "Menlo, Monaco, Consolas, 'Courier New', monospace",
                                        renderLineHighlight: "line",
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        tabSize: 4,
                                        insertSpaces: true,
                                        padding: { top: 0, bottom: 0 },
                                        scrollbar: {
                                            vertical: "visible",
                                            horizontal: "visible",
                                            verticalScrollbarSize: 6,
                                            horizontalScrollbarSize: 6,
                                        },
                                    }}
                                />
                            </Box>
                        </Paper>
                    </Box>
                </Box>
            )}

            {/* MORE OPTIONS MENU */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                slotProps={{
                    paper: {
                        sx: {
                            minWidth: 180,
                            borderRadius: "10px",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        },
                    },
                }}
            >
                <MenuItem
                    onClick={() => {
                        setMenuAnchor(null);
                        setMobileView("output");
                    }}
                >
                    <ListItemIcon>
                        <Box
                            sx={{
                                position: "relative",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <TerminalIcon fontSize="small" />
                            {hasError && (
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: -2,
                                        right: -3,
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        bgcolor: "#ef4444",
                                    }}
                                />
                            )}
                        </Box>
                    </ListItemIcon>
                    <ListItemText>Terminale</ListItemText>
                </MenuItem>

                <MenuItem
                    onClick={(e) => setExportAnchor(e.currentTarget)}
                    disabled={!props.isReady}
                >
                    <ListItemIcon>
                        <FileDownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Export Model...</ListItemText>
                </MenuItem>

                <MenuItem onClick={handleShareClick}>
                    <ListItemIcon>
                        <ShareIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Share URL</ListItemText>
                </MenuItem>

                <Divider />

                <MenuItem
                    onClick={() => {
                        props.onToggleMode();
                        setMenuAnchor(null);
                    }}
                >
                    <ListItemIcon>
                        {props.theme === "dark" ? (
                            <LightModeIcon fontSize="small" />
                        ) : (
                            <DarkModeIcon fontSize="small" />
                        )}
                    </ListItemIcon>
                    <ListItemText>
                        {props.theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </ListItemText>
                </MenuItem>
            </Menu>

            {/* EXPORT SUBMENU */}
            <Menu
                anchorEl={exportAnchor}
                open={Boolean(exportAnchor)}
                onClose={() => setExportAnchor(null)}
                slotProps={{
                    paper: {
                        sx: {
                            minWidth: 140,
                            borderRadius: "10px",
                        },
                    },
                }}
            >
                {EXPORT_FORMATS.map((fmt) => (
                    <MenuItem key={fmt} onClick={() => handleDownloadFormat(fmt)}>
                        {fmt}
                    </MenuItem>
                ))}
            </Menu>

            {/* TOAST NOTIFICATION */}
            <Toast
                message={toastMessage}
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />
        </Box>
    );
}

export default MobileLayout;

