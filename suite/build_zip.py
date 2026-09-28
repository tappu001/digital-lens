"""Builds the downloads served by the site:
    downloads/digital-lens-suite.zip     the App Inspector suite plus the Digital Lens web app
    downloads/digital-lens-recorder.zip  the Digital Lens Recorder Chrome extension (Ecommerce Audit)

    python suite/build_zip.py           build both ZIPs
    python suite/build_zip.py --check   fail if a committed ZIP is out of date with the source
"""

import io
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITE = os.path.join(ROOT, "suite")
EXT = os.path.join(ROOT, "extension")
FIXED_TIME = (2026, 1, 1, 0, 0, 0)

SUITE_FILES = ["Install Digital Lens.bat", "Uninstall Digital Lens.bat", "run_agent.py", "suite_addon.py", "decoders/__init__.py",
               "decoders/platforms.py", "requirements.txt", "README.md", "start.sh", "start-windows.bat", "restore-phone.sh", "restore-phone.bat"]
WEB_FILES = ["index.html", "app.html", "app-inspector.html", "favicon.svg"]
WEB_DIRS = ["assets", "js"]
EXECUTABLE = {"start.sh", "restore-phone.sh"}


def suite_entries():
    """[(archive name, absolute path)] in a stable order."""
    prefix = "digital-lens-suite/"
    out = [(prefix + f, os.path.join(SUITE, f)) for f in SUITE_FILES]
    out += [(prefix + f, os.path.join(ROOT, f)) for f in WEB_FILES]
    for d in WEB_DIRS:
        for base, dirs, files in os.walk(os.path.join(ROOT, d)):
            dirs.sort()
            for f in sorted(files):
                p = os.path.join(base, f)
                out.append((prefix + os.path.relpath(p, ROOT).replace(os.sep, "/"), p))
    return out


def recorder_entries():
    prefix = "digital-lens-recorder/"
    out = []
    for base, dirs, files in os.walk(EXT):
        dirs.sort()
        for f in sorted(files):
            p = os.path.join(base, f)
            out.append((prefix + os.path.relpath(p, EXT).replace(os.sep, "/"), p))
    return out


TARGETS = {
    "digital-lens-suite.zip": suite_entries,
    "digital-lens-recorder.zip": recorder_entries,
}
# kept for callers that used the single-ZIP names
OUT = os.path.join(ROOT, "downloads", "digital-lens-suite.zip")
entries = suite_entries


def build_bytes(entry_fn=suite_entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, path in entry_fn():
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = ((0o755 if os.path.basename(name) in EXECUTABLE else 0o644) | 0o100000) << 16
            with open(path, "rb") as f:
                z.writestr(info, f.read())
    return buf.getvalue()


def check_one(zip_name, entry_fn):
    out = os.path.join(ROOT, "downloads", zip_name)
    if not os.path.isfile(out):
        return [f"downloads/{zip_name} is missing"]
    problems = []
    with zipfile.ZipFile(out) as z:
        names = set(z.namelist())
        expected = entry_fn()
        for name, path in expected:
            if name not in names:
                problems.append(f"{zip_name}: missing {name}")
            else:
                with open(path, "rb") as f:
                    if z.read(name) != f.read():
                        problems.append(f"{zip_name}: out of date: {name}")
        extra = names - {n for n, _ in expected}
        problems += [f"{zip_name}: unexpected {n}" for n in sorted(extra)]
    return problems


def check():
    return [p for name, fn in TARGETS.items() for p in check_one(name, fn)]


if __name__ == "__main__":
    if "--check" in sys.argv:
        issues = check()
        if issues:
            print("Download ZIPs are not up to date. Run: python suite/build_zip.py\n  " + "\n  ".join(issues[:20]))
            sys.exit(1)
        print("Download ZIPs are up to date.")
    else:
        os.makedirs(os.path.join(ROOT, "downloads"), exist_ok=True)
        for name, fn in TARGETS.items():
            with open(os.path.join(ROOT, "downloads", name), "wb") as f:
                f.write(build_bytes(fn))
            print(f"Wrote downloads/{name} ({len(fn())} files)")
