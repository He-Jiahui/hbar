/** Inference bootstrap only. Decision policies and session state stay in the Bun Host. */
export const LAYA_PYTHON_SOURCE = String.raw`
import sys, os, json, socket, hmac
from importlib.metadata import version, PackageNotFoundError

cfg = json.loads(sys.stdin.readline())
def startup_error(code):
    print("hbar-laya-error " + json.dumps({"code": code}), flush=True)
    sys.exit(2)
try:
    if version("laya") != cfg["runtimeVersion"]:
        startup_error("MISSING_DEPENDENCY")
except PackageNotFoundError:
    startup_error("MISSING_DEPENDENCY")
os.environ["LAYA_API_KEY"] = cfg["token"]
os.environ["USE_TF"] = "0"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

try:
    import torch, uvicorn
    from fastapi.responses import JSONResponse
    from laya import Router
    from laya.serve import create_app
    from laya.common import build_sequence, render_options, serialize_state
except ImportError:
    startup_error("MISSING_DEPENDENCY")
torch.set_num_threads(min(4, os.cpu_count() or 1))

class LocalRouter(Router):
    def predict(self, state, questions, model=None, **kwargs):
        if model not in cfg["models"]:
            raise ValueError("Checkpoint is not installed in this runtime")
        agent = self.load(model)
        tok = agent.tok
        max_len = agent.cfg.get("max_len", 1024)
        head_max_len = agent.cfg.get("head_max_len", 256)
        state_ids = tok(serialize_state(state).replace(tok.mask_token, " "), add_special_tokens=False)["input_ids"]
        state_truncated = False
        questions_truncated = []
        for qid, question in questions.items():
            agent._check_question(qid, question)
            q = agent._to_internal(question)
            empty_ids, markers = build_sequence(tok, "", q, max_len, head_max_len, state_ids=[])
            state_truncated = state_truncated or len(state_ids) > max_len - len(empty_ids)
            head = tok("%s question: %s" % (q["t"], str(q["ins"]).replace(tok.mask_token, " ")), add_special_tokens=False)["input_ids"]
            options = [tok(" " + text.replace(tok.mask_token, " "), add_special_tokens=False)["input_ids"] for text in render_options(q)]
            full_head = 4 + len(head) + sum(1 + len(option) for option in options)
            if full_head > len(empty_ids):
                questions_truncated.append(qid)
        if agent.device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(agent.device)
        result = super().predict(state, questions, model=model, **kwargs)
        result["hbar_input"] = {"state_truncated": state_truncated, "questions_truncated": questions_truncated,
            "device": str(agent.device),
            "memory_allocated_bytes": torch.cuda.max_memory_allocated(agent.device) if agent.device.type == "cuda" else None,
            "memory_reserved_bytes": torch.cuda.max_memory_reserved(agent.device) if agent.device.type == "cuda" else None}
        return result

router = LocalRouter(models=cfg["models"], device=None if cfg["device"] == "auto" else cfg["device"],
    default="multilingual", max_loaded=len(cfg["models"]), auto_task_detection=False)
router.preload(list(cfg["models"]))
app = create_app(router)

@app.middleware("http")
async def health_metadata(request, call_next):
    if request.url.path == "/health":
        supplied = request.headers.get("authorization", "").encode("utf-8")
        if not hmac.compare_digest(supplied, ("Bearer " + cfg["token"]).encode("utf-8")):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return JSONResponse({"status": "ok", "instanceId": cfg["instanceId"], "runtimeVersion": version("laya"),
            "loaded": router.loaded, "devices": {key: str(router.load(key).device) for key in cfg["models"]}})
    return await call_next(request)

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(("127.0.0.1", 0))
sock.listen(128)
print("hbar-laya-ready " + json.dumps({"port": sock.getsockname()[1], "instanceId": cfg["instanceId"]}), flush=True)
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", log_level="warning", access_log=False))
try:
    server.run(sockets=[sock])
finally:
    sock.close()
    router.unload()
`
