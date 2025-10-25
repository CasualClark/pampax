# Phase 8 — Key Pseudocode

## 1) Structured Logging

```python
# log.py
import json, sys, time, uuid

def log(component, op, level="INFO", status="ok", msg="", **kw):
    rec = {
        "time": time.time(),
        "level": level,
        "component": component,
        "op": op,
        "corr_id": kw.pop("corr_id", str(uuid.uuid4())),
        "duration_ms": kw.pop("duration_ms", None),
        "status": status,
        "msg": msg,
        **kw,
    }
    sys.stdout.write(json.dumps(rec) + "\n")
```

## 2) Metrics Wrapper

```python
# metrics.py
from collections import defaultdict
import time

class Timer:
    def __init__(self, metrics, name):
        self.metrics = metrics; self.name = name
    def __enter__(self):
        self.t0 = time.perf_counter(); return self
    def __exit__(self, exc_type, *_):
        dt = (time.perf_counter() - self.t0) * 1000
        self.metrics.emit(self.name + "_latency_ms", dt)

class Metrics:
    def __init__(self, sink):
        self.sink = sink
    def emit(self, name, value, **labels):
        self.sink({"metric": name, "value": value, **labels})
```

## 3) Read‑Through Cache (Search)

```python
# cache.py
import hashlib, json, time

class Cache:
    def __init__(self, store, ttl=None, version="v1"):
        self.store = store; self.ttl = ttl; self.version = version
    def _key(self, scope, payload):
        k = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        return f"{self.version}:{scope}:{k}"
    def get(self, key):
        rec = self.store.get(key)
        if not rec: return None
        if self.ttl and time.time() - rec["t"] > self.ttl: return None
        return rec["v"]
    def set(self, key, value):
        self.store.put(key, {"t": time.time(), "v": value})

def cached_search(query, engine, cache):
    key = cache._key("search", {"q": query})
    v = cache.get(key)
    if v is not None: return v, True
    res = engine.search(query)
    cache.set(key, res)
    return res, False
```

## 4) Bundle Signature Cache

```python
# bundle_cache.py
def bundle_signature(inputs):
    # Inputs: candidate files, ranges, policies, model profile, tokenizer
    return hash(tuple(inputs))

def assemble_bundle(inputs, cache):
    sig = bundle_signature(inputs)
    key = cache._key("bundle", {"sig": sig})
    v = cache.get(key)
    if v is not None: return v, True
    bundle = _compute_bundle(inputs)  # existing logic
    cache.set(key, bundle)
    return bundle, False
```

## 5) Error Taxonomy & Exit Codes

```python
# errors.py
class ErrKind:
    CONFIG=2; IO=3; NETWORK=4; TIMEOUT=5; INTERNAL=6

def main():
    try:
        run()
    except ConfigError as e:
        print(str(e)); exit(ErrKind.CONFIG)
    # ... map other kinds
```

## 6) Health Command

```python
# health.py
def health():
    checks = {
        "sqlite": check_sqlite(),
        "cache": check_cache(),
        "index": check_index_ready(),
    }
    ok = all(v["ok"] for v in checks.values())
    print(json.dumps({"ok": ok, "checks": checks}))
    exit(0 if ok else 1)
```

## 7) Deterministic Output

```python
# cli.py
import sys
def is_piped():
    return not sys.stdout.isatty()

def print_result(res, format="json"):
    if is_piped():
        # No colors/spinners; stable ordering
        print(to_json_stable(res))
    else:
        print(format_pretty(res))
```

## 8) Benchmark Harness (sketch)

```python
# bench/run_bench.py
for mode in ["cold", "warm"]:
    warm_cache() if mode=="warm" else clear_cache()
    for trial in range(TRIALS):
        t0=now(); search("adapter interface"); rec("search_latency_ms", now()-t0, mode=mode)
        # ... assemble, sqlite read, etc.
save_json_csv(results)
```
