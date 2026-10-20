"""Load the exact compact-source-v2 files that v4 runs unchanged, under a hash-named module.

v4 never imports whatever `compact_source_v2` happens to be importable. It reads the four v2 files
that sit beside this package, checks each against the hash pinned here, and only then runs the
checked bytes as `_compact_source_v2_<hash>.contract` and `.validate`. A changed file refuses to load.
v2's own recipe binding reads all four files, so all four are pinned, though only two are run.
"""
import hashlib
import json
import sys
import types
from pathlib import Path

PINNED = {
    'contract.py': 'd3d96709edda2fb6857d20db5c405ade1ed9063dcb932e7cad5a617c9a71b7e8',
    'validate.py': '4b87940382083c6e77c1cf34543f84a26ee5f81b1e764f00ba15438a7bd5c2d0',
    'request.py': '7ff43f0d8a3b92e12f63ae0b88e0ca62a94191954620d0003860521241dbea0d',
    'reader.md': '465d78d6666c318a5f4aa8a3030cf52154cdb4757242a83e06181bcf5b650e50',
}
DEFAULT_ROOT = Path(__file__).resolve().parents[1] / 'compact_source_v2'
NAMESPACE = '_compact_source_v2_' + hashlib.sha256(json.dumps(PINNED, sort_keys=True).encode()).hexdigest()[:16]


class DependencyError(ImportError):
    pass


def load_v2(root=DEFAULT_ROOT):
    """Return the v2 validate module built from the pinned bytes in `root`."""
    root = Path(root)
    blobs = {}
    for name, want in PINNED.items():
        path = root / name
        if not path.is_file():
            raise DependencyError(f'{path} is missing')
        data = path.read_bytes()
        got = hashlib.sha256(data).hexdigest()
        if got != want:
            raise DependencyError(f'{path} has sha256 {got}, pinned {want}')
        blobs[name] = data
    if f'{NAMESPACE}.validate' in sys.modules:
        loaded = sys.modules[f'{NAMESPACE}.validate']
        if Path(loaded.__file__).parent.resolve() == root.resolve():
            return loaded
    package = types.ModuleType(NAMESPACE)
    package.__path__ = []
    package.__package__ = NAMESPACE
    saved = {k: sys.modules.get(k) for k in (NAMESPACE, f'{NAMESPACE}.contract', f'{NAMESPACE}.validate')}
    sys.modules[NAMESPACE] = package
    try:
        for name in ('contract', 'validate'):
            module = types.ModuleType(f'{NAMESPACE}.{name}')
            module.__package__ = NAMESPACE
            module.__file__ = str(root / f'{name}.py')
            sys.modules[module.__name__] = module
            # the bytes that were hashed are the bytes that run
            exec(compile(blobs[f'{name}.py'], module.__file__, 'exec'), module.__dict__)
            setattr(package, name, module)
    except Exception:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        raise
    return sys.modules[f'{NAMESPACE}.validate']


V2 = load_v2()
