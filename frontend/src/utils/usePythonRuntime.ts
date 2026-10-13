import { useState, useCallback, useEffect, useRef } from "react";
import { PythonRuntime } from "./PythonRuntime";

interface UsePythonRuntimeReturn {
    modelData: any;
    stdout: string;
    stderr: string;
    isRunning: boolean;
    isReady: boolean;
    runCode: (code: string) => Promise<void>;
    downloadExport: (format: string, currentCode?: string) => Promise<boolean>;
    clearOutput: () => void;
}

export function usePythonRuntime(): UsePythonRuntimeReturn {
    const [modelData, setModelData] = useState<any>();
    const [stdout, setStdout] = useState("");
    const [stderr, setStderr] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isBackend, setIsBackend] = useState(false);
    const pythonRuntimeRef = useRef<PythonRuntime | null>(null);
    const currentCodeRef = useRef<string>("");

    // Initialize Python runtime (Cloud Backend first, Pyodide WASM fallback)
    useEffect(() => {
        let isCancelled = false;

        const checkBackendAndInit = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const res = await fetch("/api/status", { method: "GET", signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data.status === "online" && !isCancelled) {
                        console.log("Connected to Cloud CAD engine:", data);
                        setIsBackend(true);
                        setIsReady(true);
                        setStdout(
                            `Connected to Cloud CAD Engine (Python ${data.python_version.split(" ")[0]} - build123d ${data.build123d_version})\nHigh-performance native execution active.\n`
                        );
                        return;
                    }
                }
            } catch {
                console.log("Cloud backend not available, initializing client Pyodide WASM...");
            }

            if (isCancelled) return;

            // Fallback to Pyodide
            const runtime = new PythonRuntime((data: any, msg_type: string) => {
                if (msg_type === "DATA") {
                    setModelData(data);
                }
            });

            runtime.setStdoutCallback((newStdout: string) => {
                setStdout((prev) => (newStdout.length > 0 ? prev + newStdout + "\n" : prev));
            });

            runtime.setStderrCallback((newStderr: string) => {
                setStderr((prev) => (newStderr.length > 0 ? prev + newStderr + "\n" : prev));
            });

            pythonRuntimeRef.current = runtime;

            try {
                await runtime.initialize();
                if (!isCancelled) {
                    setIsReady(true);
                }
            } catch (error: any) {
                console.error("Failed to initialize Pyodide:", error);
            }
        };

        checkBackendAndInit();

        return () => {
            isCancelled = true;
        };
    }, []);

    const runCode = useCallback(
        async (code: string) => {
            if (!isReady) {
                throw new Error("Python runtime is not ready yet");
            }
            currentCodeRef.current = code;
            clearOutput();
            setIsRunning(true);

            if (isBackend) {
                try {
                    const res = await fetch("/api/run", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code }),
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        setStderr(errText || `Server error: ${res.status}`);
                        return;
                    }

                    const data = await res.json();
                    if (data.stdout) setStdout(data.stdout);
                    if (data.stderr) setStderr(data.stderr);
                    if (data.modelData) setModelData(data.modelData);
                } catch (err: any) {
                    setStderr("Failed to communicate with CAD engine: " + err.message);
                } finally {
                    setIsRunning(false);
                }
                return;
            }

            // Pyodide execution
            if (pythonRuntimeRef.current) {
                try {
                    await pythonRuntimeRef.current.runCode(code);
                } finally {
                    setIsRunning(false);
                }
            } else {
                setIsRunning(false);
            }
        },
        [isReady, isBackend]
    );

    const downloadExport = useCallback(
        async (format: string, currentCode?: string) => {
            const codeToExport = currentCode || currentCodeRef.current;

            if (isBackend) {
                try {
                    const res = await fetch("/api/export", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ format, code: codeToExport }),
                    });

                    if (!res.ok) {
                        const err = await res.json().catch(() => ({ detail: "Export failed" }));
                        alert(err.detail || "Export failed on CAD engine");
                        return false;
                    }

                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `model.${format.toLowerCase()}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    return true;
                } catch (err: any) {
                    alert("Export error: " + err.message);
                    return false;
                }
            }

            if (!pythonRuntimeRef.current) return false;
            const bytes = await pythonRuntimeRef.current.exportShape(format);
            if (bytes) {
                const blob = new Blob([bytes], { type: "application/octet-stream" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `model.${format.toLowerCase()}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return true;
            }
            return false;
        },
        [isBackend]
    );

    const clearOutput = useCallback(() => {
        setStdout("");
        setStderr("");
        if (pythonRuntimeRef.current) {
            pythonRuntimeRef.current.clearOutput();
        }
    }, []);

    return {
        modelData,
        stdout,
        stderr,
        isRunning,
        isReady,
        runCode,
        downloadExport,
        clearOutput,
    };
}