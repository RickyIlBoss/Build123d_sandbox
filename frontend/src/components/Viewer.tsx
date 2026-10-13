import * as React from "react";
import Box from "@mui/material/Box";
import { useCallback, useEffect, useRef } from "react";
import * as TCV from "three-cad-viewer";
import useResizeObserver from "../utils/useResizeObserver";

// Helper functions for decoding model data
const MAP_HEX = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    a: 10,
    b: 11,
    c: 12,
    d: 13,
    e: 14,
    f: 15,
    A: 10,
    B: 11,
    C: 12,
    D: 13,
    E: 14,
    F: 15,
};

function fromHex(hexString: string) {
    const bytes = new Uint8Array(Math.floor((hexString || "").length / 2));
    let i;
    for (i = 0; i < bytes.length; i++) {
        const a = MAP_HEX[hexString[i * 2] as keyof typeof MAP_HEX];
        const b = MAP_HEX[hexString[i * 2 + 1] as keyof typeof MAP_HEX];
        if (a === undefined || b === undefined) {
            break;
        }
        bytes[i] = (a << 4) | b;
    }
    return i === bytes.length ? bytes : bytes.slice(0, i);
}

function fromB64(s: string) {
    let bytes = atob(s);
    let uint = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) uint[i] = bytes[i].charCodeAt(0);
    return uint;
}

function decode(data: any) {
    function convert(obj: any): any {
        var result;
        if (typeof obj.buffer == "string") {
            var buffer;
            if (obj.codec === "b64") {
                buffer = fromB64(obj.buffer);
            } else {
                buffer = fromHex(obj.buffer);
            }
            if (obj.dtype === "float32") {
                result = new Float32Array(buffer.buffer);
            } else if (obj.dtype === "int32") {
                result = new Uint32Array(buffer.buffer);
            } else if (obj.dtype === "uint32") {
                result = new Uint32Array(buffer.buffer);
            } else {
                console.error("Error: unknown dtype", obj.dtype);
            }
        } else if (Array.isArray(obj)) {
            result = [];
            for (var arr of obj) {
                result.push(convert(arr));
            }
            return result;
        } else {
            console.error("Error: unknown buffer type", obj.buffer);
        }
        return result;
    }

    function walk(obj: any) {
        var type = null;
        for (var attr in obj) {
            if (attr === "parts") {
                for (var i in obj.parts) {
                    walk(obj.parts[i]);
                }
            } else if (attr === "type") {
                type = obj.type;
            } else if (attr === "shape") {
                if (type === "shapes") {
                    if (obj.shape.ref === undefined) {
                        obj.shape.vertices = convert(obj.shape.vertices);
                        obj.shape.obj_vertices = convert(
                            obj.shape.obj_vertices,
                        );
                        obj.shape.normals = convert(obj.shape.normals);
                        obj.shape.edge_types = convert(obj.shape.edge_types);
                        obj.shape.face_types = convert(obj.shape.face_types);
                        obj.shape.triangles = convert(obj.shape.triangles);
                        obj.shape.triangles_per_face = convert(
                            obj.shape.triangles_per_face,
                        );
                        obj.shape.edges = convert(obj.shape.edges);
                        obj.shape.segments_per_edge = convert(
                            obj.shape.segments_per_edge,
                        );
                    } else {
                        const ind = obj.shape.ref;
                        if (ind !== undefined) {
                            obj.shape = instances[ind];
                        }
                    }
                } else if (type === "edges") {
                    obj.shape.edges = convert(obj.shape.edges);
                    obj.shape.segments_per_edge = convert(
                        obj.shape.segments_per_edge,
                    );
                    obj.shape.obj_vertices = convert(obj.shape.obj_vertices);
                } else {
                    obj.shape.obj_vertices = convert(obj.shape.obj_vertices);
                }
            }
        }
    }

    const instances = data.data.instances;

    data.data.instances.forEach((instance: any) => {
        instance.vertices = convert(instance.vertices);
        instance.obj_vertices = convert(instance.obj_vertices);
        instance.normals = convert(instance.normals);
        instance.edge_types = convert(instance.edge_types);
        instance.face_types = convert(instance.face_types);
        instance.triangles = convert(instance.triangles);
        instance.triangles_per_face = convert(instance.triangles_per_face);
        instance.edges = convert(instance.edges);
        instance.segments_per_edge = convert(instance.segments_per_edge);
    });

    walk(data.data.shapes);
    data.data.instances = [];
}

function getRenderOptions(theme: "light" | "dark") {
    return {
        ambientIntensity: 1.0,
        directIntensity: 1.1,
        metalness: 0.3,
        roughness: 0.65,
        edgeColor: theme === "dark" ? 0xaab7ca : 0x536176,
        defaultOpacity: 0.5,
        normalLen: 0,
        angularTolerance: 0.2,
        deviation: 0.1,
        defaultColor: theme === "dark" ? "#2dd4bf" : "#0f766e",
    };
}

const baseViewerOptions = {
    axes: true,
    axes0: true,
    blackEdges: false,
    grid: [false, false, false] as [boolean, boolean, boolean],
    collapse: false,
    ortho: true,
    ticks: 10,
    centerGrid: false,
    timeit: false,
    transparent: false,
    panSpeed: 0.5,
    zoomSpeed: 0.8,
    rotateSpeed: 1,
    clipSlider0: 0,
    clipSlider1: 0,
    clipSlider2: 0,
    clipNormal0: [1, 0, 0] as [number, number, number],
    clipNormal1: [0, 1, 0] as [number, number, number],
    clipNormal2: [0, 0, 1] as [number, number, number],
    clipIntersection: false,
    clipPlaneHelpers: false,
    clipObjectColors: false,
};

function applyTwoFingerControls(viewer: any) {
    if (!viewer) return;
    try {
        const rendered = viewer._rendered;
        if (!rendered || !rendered.controls) return;
        const ctrl = rendered.controls.controls;
        if (!ctrl || (ctrl as any).__twoFingerPatched) return;
        (ctrl as any).__twoFingerPatched = true;

        let lastAngle: number | null = null;
        let lastDist: number | null = null;
        let lastMidX: number | null = null;
        let lastMidY: number | null = null;

        let isZooming = false;
        let isPanning = false;

        // 1. Two-finger rotation & gesture intent detection
        if ("_rotateCamera" in ctrl) {
            const origRotateCamera = ctrl._rotateCamera.bind(ctrl);
            ctrl._rotateCamera = function () {
                const pointersCount = this._pointers ? this._pointers.length : 0;

                // 1 FINGER: original 360° spherical trackball rotation, full speed, 0 lag
                if (pointersCount < 2 && this.state !== 4) {
                    lastAngle = null;
                    lastDist = null;
                    lastMidX = null;
                    lastMidY = null;
                    isZooming = false;
                    isPanning = false;
                    origRotateCamera();
                    return;
                }

                // 2 OR MORE FINGERS:
                // Neutralize the broken Holroyd single-pointer jump bug completely
                if (this._holroydStart && this._holroydEnd) {
                    this._holroydStart.copy(this._holroydEnd);
                }
                if (this._movePrev && this._moveCurr) {
                    this._movePrev.copy(this._moveCurr);
                }

                const p0 = this._pointerPositions?.[this._pointers[0]?.pointerId];
                const p1 = this._pointerPositions?.[this._pointers[1]?.pointerId];

                if (!p0 || !p1) {
                    lastAngle = null;
                    lastDist = null;
                    lastMidX = null;
                    lastMidY = null;
                    isZooming = false;
                    isPanning = false;
                    return;
                }

                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const currentDist = Math.hypot(dx, dy);
                const currentAngle = Math.atan2(dy, dx);
                const currentMidX = (p0.x + p1.x) / 2;
                const currentMidY = (p0.y + p1.y) / 2;

                if (lastDist === null || lastMidX === null || lastMidY === null || lastAngle === null) {
                    lastDist = currentDist;
                    lastMidX = currentMidX;
                    lastMidY = currentMidY;
                    lastAngle = currentAngle;
                    isZooming = false;
                    isPanning = false;
                    return;
                }

                const distDelta = Math.abs(currentDist - lastDist);
                const midDelta = Math.hypot(currentMidX - lastMidX, currentMidY - lastMidY);

                let deltaAngle = currentAngle - lastAngle;
                if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
                if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
                const angleDelta = Math.abs(deltaAngle);

                // Gesture intent classification:
                // - Zoom: distance between fingers is changing noticeably (> 1.5px)
                // - Pan: midpoint is moving noticeably (> 2.0px) and it's not a pure pinch
                // - Rotate: angle is changing noticeably (> 0.005 rad)
                isZooming = distDelta >= 1.5;
                isPanning = midDelta >= 2.0 && !(isZooming && midDelta < distDelta * 0.4);
                const isRotating = angleDelta >= 0.005 && !(isPanning && angleDelta < 0.02);

                // Apply two-finger twist rotation smoothly
                if (isRotating) {
                    const eye = this.object.position.clone().sub(this.target);
                    if (eye.lengthSq() > 0.0001) {
                        const rollAxis = eye.normalize();
                        const q = new (this.object.quaternion.constructor)();
                        q.setFromAxisAngle(rollAxis, deltaAngle);
                        this.object.quaternion.premultiply(q);
                        this.object.up.applyQuaternion(q);
                    }
                }

                lastDist = currentDist;
                lastMidX = currentMidX;
                lastMidY = currentMidY;
                lastAngle = currentAngle;
            };
        }

        // 2. Zoom handling: zoom only when user is actually pinching (not during pan)
        if ("_zoomCamera" in ctrl) {
            const origZoomCamera = ctrl._zoomCamera.bind(ctrl);
            ctrl._zoomCamera = function () {
                if (this.state === 4) { // TOUCH_ZOOM_PAN
                    if (!isZooming) {
                        // Suppress zoom jitter during pan / rotation
                        this._touchZoomDistanceStart = this._touchZoomDistanceEnd;
                        return;
                    }
                }
                origZoomCamera();
            };
        }

        // 3. Pan handling: pan only when user is actually sliding (never during pinch-to-zoom)
        if ("_panCamera" in ctrl) {
            const origPanCamera = ctrl._panCamera.bind(ctrl);
            ctrl._panCamera = function () {
                const pointersCount = this._pointers ? this._pointers.length : 0;
                if (pointersCount >= 2 || this.state === 4) {
                    if (!isPanning) {
                        // Keep pan synchronized so zooming in place does NOT move the model
                        if (this._panStart && this._panEnd) {
                            this._panStart.copy(this._panEnd);
                        }
                        return;
                    }
                }
                origPanCamera();
            };
        }
    } catch (e) {
        console.warn("Could not apply two finger controls:", e);
    }
}

interface ViewerProps {
    modelData?: string;
    theme?: "light" | "dark";
    treeWidth?: number;
    tools?: boolean;
    up?: "Z" | "Y" | "legacy";
    control?: "trackball" | "orbit";
    glass?: boolean;
}

function autoFrameModel(viewerInstance: any, width: number, height: number) {
    if (!viewerInstance?.rendered) return;
    try {
        const camera = viewerInstance.rendered?.camera?.camera;
        if (camera && typeof camera.clearViewOffset === "function") {
            camera.clearViewOffset();
            camera.updateProjectionMatrix?.();
        }

        // On mobile, as the sheet is dragged down and the viewer height expands,
        // the model smoothly enlarges from compact (~0.45 when editor is pulled high)
        // all the way up to 1.0 (the exact original sandbox size when editor is pulled down).
        const winH = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 700;
        const minH = 180;
        // Reaches full 1.0 sandbox size as the sheet reaches the bottom (~75-80% viewer height)
        const maxH = Math.max(480, Math.round(winH * 0.76));
        const minZoom = 0.45;
        const maxZoom = 1.0;

        let zoomVal: number;
        if (height <= minH) {
            zoomVal = minZoom;
        } else if (height >= maxH) {
            zoomVal = maxZoom;
        } else {
            const progress = (height - minH) / (maxH - minH);
            zoomVal = minZoom + progress * (maxZoom - minZoom);
        }

        if (typeof viewerInstance.setCameraZoom === "function") {
            viewerInstance.setCameraZoom(Number(zoomVal.toFixed(3)), false);
        }
    } catch (e) {
        console.warn("autoFrameModel error:", e);
    }
}

function Viewer(props: ViewerProps) {
    const viewerInstanceRef = useRef<any>(null);
    const displayInstanceRef = useRef<any>(null);

    const {
        modelData,
        theme = "light",
        treeWidth = 240,
        tools = true,
        up = "Z",
        control = "trackball",
        glass = true,
    } = props;
    const renderOptions = getRenderOptions(theme);

    const onResize = useCallback(
        (size: { width: number; height: number }) => {
            if (viewerInstanceRef.current) {
                const wasInfoOpen = Boolean(displayInstanceRef.current?.info_shown);
                const width = glass
                    ? size.width - 20
                    : Math.max(10, size.width - treeWidth);
                const height = Math.max(50, size.height);
                viewerInstanceRef.current.resizeCadView(
                    width,
                    treeWidth,
                    height,
                    glass,
                );
                autoFrameModel(viewerInstanceRef.current, width, height);
                // Keep info open if user had activated it
                if (wasInfoOpen && displayInstanceRef.current) {
                    displayInstanceRef.current.showInfo(true);
                }
                // Keep tree navigation and > Info pinned directly at the top under Group
                const dom = viewerRef.current;
                if (dom) {
                    const nav = dom.querySelector(".tcv_cad_navigation") as HTMLElement;
                    if (nav) nav.style.height = "auto";
                    const infoWrapper = dom.querySelector(".tcv_cad_info_wrapper") as HTMLElement;
                    if (infoWrapper) infoWrapper.style.height = "auto";
                }
            }
        },
        [treeWidth, glass],
    );

    const [viewerRef] = useResizeObserver(onResize);

    // Initialize viewer with actual container size
    useEffect(() => {
        if (viewerRef.current && !viewerInstanceRef.current) {
            const combinedOptions: any = {
                // Render & Viewer Options
                ...baseViewerOptions,
                ...renderOptions,
                up: up,
                control: control,

                // Display Options
                cadWidth: 800,
                height: 600,
                treeWidth: treeWidth,
                theme: theme,
                tools: tools,
                pinning: false,
                keymap: {
                    shift: "shiftKey",
                    ctrl: "ctrlKey",
                    meta: "metaKey",
                    alt: "altKey",
                },
                newTreeBehavior: true,
                measurementDebug: false,

                glass: glass,
                measureTools: false,
                explodeTool: false,
                selectTool: false,
                zscaleTool: false,
                zebraTool: true,
            };

            // Create display
            displayInstanceRef.current = new TCV.Display(
                viewerRef.current,
                combinedOptions,
            );

            // Pass the exact same combined configuration to the Viewer
            viewerInstanceRef.current = new TCV.Viewer(
                displayInstanceRef.current,
                combinedOptions,
                () => {},
            );

            // Maintain proper 3D model framing away from top icons on reset
            const origReset = viewerInstanceRef.current.reset.bind(viewerInstanceRef.current);
            viewerInstanceRef.current.reset = () => {
                origReset();
                const curW = viewerRef.current?.clientWidth || 360;
                const curH = viewerRef.current?.clientHeight || 400;
                autoFrameModel(viewerInstanceRef.current, curW, curH);
            };

            // Prevent glassMode from automatically resetting info to closed if it was opened
            const origGlassMode = displayInstanceRef.current.glassMode.bind(displayInstanceRef.current);
            displayInstanceRef.current.glassMode = function(flag: boolean) {
                const wasInfoOpen = Boolean(this.info_shown);
                origGlassMode(flag);
                if (wasInfoOpen) {
                    this.showInfo(true);
                }
            };

            // When clicking inside tree -> show translucent box; when clicking away -> hide it
            const domNode = viewerRef.current;
            let handlePointerDown: ((e: PointerEvent) => void) | null = null;
            if (domNode) {
                handlePointerDown = (e: PointerEvent) => {
                    const tree = domNode.querySelector(".tcv_cad_tree");
                    if (!tree) return;
                    if (tree.contains(e.target as Node)) {
                        tree.classList.add("tcv_tree_active");
                    } else {
                        tree.classList.remove("tcv_tree_active");
                    }
                };
                // Make sure tapping ellipsis (...) on touch devices expands the face group immediately
                const ellipses = domNode.querySelectorAll(".tcv_ellipsis");
                ellipses.forEach((el, idx) => {
                    const openGroup = (e: Event) => {
                        e.stopPropagation();
                        displayInstanceRef.current?.cadTool?.maximize(idx);
                    };
                    el.addEventListener("pointerdown", openGroup);
                    el.addEventListener("click", openGroup);
                });
                window.addEventListener("pointerdown", handlePointerDown);
            }

            // Force layout styles to match
            displayInstanceRef.current.glassMode(glass);
            displayInstanceRef.current.showTools(tools);
            displayInstanceRef.current.setTheme(theme);

            return () => {
                if (handlePointerDown) {
                    window.removeEventListener("pointerdown", handlePointerDown);
                }
                if (viewerInstanceRef.current) {
                    viewerInstanceRef.current.hasAnimationLoop = false;
                    viewerInstanceRef.current.continueAnimation = false;
                    viewerInstanceRef.current.dispose();
                    viewerInstanceRef.current = null;
                }
                if (displayInstanceRef.current) {
                    displayInstanceRef.current.dispose();
                    displayInstanceRef.current = null;
                }
            };
        }
    }, [treeWidth, tools, up, control, glass]);

    // Theme changes only update the existing viewer instance. Recreating the
    // viewer here would reset its internal layout and resize the viewport.
    useEffect(() => {
        if (displayInstanceRef.current) {
            displayInstanceRef.current.setTheme(theme);
        }
    }, [theme]);

    // Handle python runtime pushes
    useEffect(() => {
        if (viewerInstanceRef.current && modelData) {
            let parsedData;
            try {
                let jsonString = modelData;
                if (jsonString.startsWith("D:")) {
                    jsonString = jsonString.substring(2);
                }
                if (!jsonString.startsWith("{")) {
                    jsonString = "{" + jsonString;
                }
                parsedData = JSON.parse(jsonString);
            } catch (error) {
                console.error("Error parsing modelData JSON:", error);
                return;
            }

            let decodedData = parsedData;
            if (parsedData.data && parsedData.data.instances) {
                decode(decodedData);
            }

            // Sync the render options with our desired feature state
            const viewerOptions = {
                ...baseViewerOptions,
                glass: glass,
                measureTools: false,
                explodeTool: true,
                selectTool: false,
                zscaleTool: true,
                zebraTool: true,
                tools: true,
                up: up,
                control: control,
                theme: theme,
            };

            try {
                viewerInstanceRef.current.clear();
                viewerInstanceRef.current.render(
                    decodedData.data.shapes,
                    renderOptions,
                    viewerOptions,
                );
                applyTwoFingerControls(viewerInstanceRef.current);
                const curW = viewerRef.current?.clientWidth || 360;
                const curH = viewerRef.current?.clientHeight || 400;
                autoFrameModel(viewerInstanceRef.current, curW, curH);
            } catch (error) {
                console.error("Error rendering model:", error);
            }
        }
    }, [modelData, up, control, glass]);

    return (
        <Box // Viewer container
            ref={viewerRef}
            // 🚨 minWidth: 0 and minHeight: 0 prevents the Viewer container from blowing out
            // the flex layout when the three-cad-viewer internal pixel sizes run wide.
            sx={{
                overflow: "hidden",
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
            }}
        />
    );
}

export default Viewer;
