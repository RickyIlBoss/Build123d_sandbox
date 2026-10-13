import io
import sys
import traceback
import logging
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import build123d as b3d
import ocp_vscode
from ocp_vscode.comms import MessageType, default
import orjson

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("build123d-backend")

app = FastAPI(title="Build123d Local Sandbox Backend")

# Allow CORS for local frontend (Vite dev server and preview)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global store for the last executed environment (for exports)
last_execution_globals: Dict[str, Any] = {}

class RunRequest(BaseModel):
    code: str

class ExportRequest(BaseModel):
    code: Optional[str] = None
    format: str

@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "backend": "cloud-cad-engine",
        "python_version": sys.version,
        "build123d_version": getattr(b3d, "__version__", "0.13.0"),
    }

@app.post("/api/run")
async def run_code(req: RunRequest):
    global last_execution_globals

    code = req.code
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()

    captured_models = []

    # Intercept ocp_vscode _send
    def _local_send(data, message_type, port=None, timeit=False):
        if message_type == MessageType.DATA:
            j = orjson.dumps(data, default=default)
            # Prefix with "D:" as expected by Viewer.tsx decode pipeline
            payload = b"D:" + j
            captured_models.append(payload.decode("utf-8"))
            return {}
        elif message_type == MessageType.COMMAND:
            return {
                "collapse": False,
                "_splash": False,
                "glass": True,
                "default_facecolor": (1, 234, 56),
                "default_thickedgecolor": (123, 45, 6),
                "default_vertexcolor": (123, 45, 6),
            }
        return {}

    # Save original comms._send and stdout/stderr
    orig_send = ocp_vscode.comms.comms._send
    orig_stdout = sys.stdout
    orig_stderr = sys.stderr

    exec_globals = {
        "__name__": "__main__",
        "build123d": b3d,
        "ocp_vscode": ocp_vscode,
        "show": ocp_vscode.show,
    }
    # Import build123d contents into global namespace
    for attr in dir(b3d):
        if not attr.startswith("_"):
            exec_globals[attr] = getattr(b3d, attr)

    try:
        ocp_vscode.comms.comms._send = _local_send
        sys.stdout = stdout_buf
        sys.stderr = stderr_buf

        exec(code, exec_globals)
        last_execution_globals = exec_globals
        success = True
    except Exception as exc:
        success = False
        stderr_buf.write(traceback.format_exc())
    finally:
        ocp_vscode.comms.comms._send = orig_send
        sys.stdout = orig_stdout
        sys.stderr = orig_stderr

    stdout_val = stdout_buf.getvalue()
    stderr_val = stderr_buf.getvalue()
    model_data = captured_models[-1] if captured_models else None

    # If code didn't explicitly call show(), but defined __EXPORT__ or shapes, we can auto-show
    if not model_data and success and "__EXPORT__" in exec_globals:
        shape = exec_globals["__EXPORT__"]
        try:
            ocp_vscode.comms.comms._send = _local_send
            ocp_vscode.show(shape)
            if captured_models:
                model_data = captured_models[-1]
        except Exception:
            pass
        finally:
            ocp_vscode.comms.comms._send = orig_send

    return {
        "success": success,
        "stdout": stdout_val,
        "stderr": stderr_val,
        "modelData": model_data,
        "hasModel": model_data is not None,
    }

@app.post("/api/export")
async def export_shape(req: ExportRequest):
    global last_execution_globals
    format_type = req.format.upper()

    # If code is supplied, re-evaluate or use last executed globals
    target_globals = last_execution_globals
    if req.code:
        g = {
            "__name__": "__main__",
            "build123d": b3d,
            "ocp_vscode": ocp_vscode,
            "show": ocp_vscode.show,
        }
        for attr in dir(b3d):
            if not attr.startswith("_"):
                g[attr] = getattr(b3d, attr)
        try:
            exec(req.code, g)
            target_globals = g
            last_execution_globals = g
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to execute code for export: {exc}")

    if "__EXPORT__" not in target_globals:
        raise HTTPException(
            status_code=400,
            detail="No '__EXPORT__' variable found in scope. Set '__EXPORT__ = my_shape' before exporting."
        )

    shape = target_globals["__EXPORT__"]
    if not isinstance(shape, b3d.Shape):
        raise HTTPException(
            status_code=400,
            detail=f"Variable '__EXPORT__' must be an instance of build123d.Shape, got {type(shape).__name__}."
        )

    bio = io.BytesIO()
    try:
        if format_type == "BREP":
            b3d.export_brep(shape, bio)
            filename = "model.brep"
        elif format_type == "STL":
            exporter = b3d.Mesher()
            exporter.add_shape(shape)
            exporter.write_stream(bio, "stl")
            filename = "model.stl"
        elif format_type == "STEP":
            b3d.export_step(shape, bio)
            filename = "model.step"
        elif format_type == "SVG":
            exporter = b3d.ExportSVG()
            exporter.add_shape(shape)
            exporter.write(bio)
            filename = "model.svg"
        elif format_type == "DXF":
            exporter = b3d.ExportDXF()
            exporter.add_shape(shape)
            exporter.write(bio)
            filename = "model.dxf"
        elif format_type == "3MF":
            exporter = b3d.Mesher()
            exporter.add_shape(shape)
            exporter.write_stream(bio, "3mf")
            filename = "model.3mf"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format_type}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export error: {str(exc)}")

    content = bio.getvalue()
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

# Static file serving for the React frontend (when built in frontend/dist)
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    python_dir = os.path.join(dist_dir, "python")
    if os.path.exists(python_dir):
        app.mount("/python", StaticFiles(directory=python_dir), name="python")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        target = os.path.join(dist_dir, full_path)
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        index_file = os.path.join(dist_dir, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend dist not found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)
