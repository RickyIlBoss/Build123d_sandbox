import * as React from "react";
import { useState, useRef } from "react";
import Box from "@mui/material/Box";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import CodeIcon from "@mui/icons-material/Code";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
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
    // More options menu anchor
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

    // Toast notification state
    const [toastMessage, setToastMessage] = useState("");
    const [showToast, setShowToast] = useState(false);

    const hasError = Boolean(props.stderr && props.stderr.trim().length > 0);

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
            setToastMessage(
                `Export as ${format} failed. Make sure to run the code first.`,
            );
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
                height: "100dvh",
                width: "100%",
                overflow: "hidden",
                bgcolor: "background.default",
            }}
        >
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <Box
                    sx={{
                        display: mobileView === "viewer" ? "block" : "none",
                        height: "100%",
                    }}
                >
                    <Viewer
                        modelData={props.modelData}
                        treeWidth={0}
                        theme={props.theme}
                    />
                </Box>
                <Box
                    sx={{
                        display: mobileView === "code" ? "flex" : "none",
                        height: "100%",
                        minHeight: 0,
                        flexDirection: "column",
                        p: "10px",
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
                                        transition:
                                            "transform 0.08s, opacity 0.08s",
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
                                    onClick={(e) =>
                                        setMenuAnchor(e.currentTarget)
                                    }
                                    title="Opzioni"
                                    sx={{
                                        color: "text.secondary",
                                        p: 0.75,
                                        transition:
                                            "transform 0.08s, opacity 0.08s",
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
                                theme={
                                    props.theme === "dark" ? "vs-dark" : "light"
                                }
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
                <Box
                    sx={{
                        display: mobileView === "output" ? "block" : "none",
                        height: "100%",
                    }}
                >
                    <PythonOutput
                        stdout={props.stdout}
                        stderr={props.stderr}
                        isRunning={props.isRunning}
                    />
                </Box>
            </Box>
            <Paper
                elevation={8}
                sx={{
                    flexShrink: 0,
                    borderRadius: 0,
                    pb: "env(safe-area-inset-bottom)",
                }}
            >
                <BottomNavigation
                    showLabels
                    value={mobileView}
                    onChange={(_, newValue: MobileAction) => {
                        if (newValue === "run") {
                            void handleRunClick();
                            return;
                        }
                        setMobileView(newValue);
                    }}
                >
                    <BottomNavigationAction
                        label="Viewer"
                        value="viewer"
                        icon={<ViewInArIcon />}
                    />
                    <BottomNavigationAction
                        label="Code"
                        value="code"
                        icon={<CodeIcon />}
                    />
                    <BottomNavigationAction
                        label={
                            !props.isReady
                                ? "Loading"
                                : props.isRunning
                                  ? "Running"
                                  : "Run"
                        }
                        value="run"
                        disabled={!props.isReady || props.isRunning}
                        icon={
                            !props.isReady || props.isRunning ? (
                                <CircularProgress size={22} />
                            ) : (
                                <PlayArrowIcon />
                            )
                        }
                    />
                    <BottomNavigationAction
                        label="Output"
                        value="output"
                        icon={
                            <TerminalIcon
                                color={hasError ? "error" : "inherit"}
                            />
                        }
                    />
                </BottomNavigation>
            </Paper>

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
                    <MenuItem
                        key={fmt}
                        onClick={() => handleDownloadFormat(fmt)}
                    >
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
