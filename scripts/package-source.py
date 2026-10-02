"""Package edited working source, excluding credentials and runtime output."""
from pathlib import Path
import hashlib
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / "artifacts" / "PairTalk-remediation-2026-10-02.zip"
files = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode().split("\0")
excluded_dirs = {
    ".git", ".agents", ".codex", ".aws", ".gemini", ".system_generated",
    "node_modules", "dist", "build", ".output", ".cache", "coverage",
    "recordings", "uploads", "artifacts", "__pycache__",
}
excluded_suffixes = {".zip", ".log", ".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".pyc", ".tsbuildinfo"}
credential = re.compile(rb"gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b\d{7,14}:[A-Za-z0-9_-]{32,45}\b")
private_values = set()
for dotenv in [root / ".env", *(root / app / ".env" for app in ["server", "admin", "client", "landing"])]:
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            match = re.match(r"\s*([A-Z_]*(?:TOKEN|PASSWORD|SECRET|API_KEY)[A-Z_]*)\s*=\s*(.+)", line)
            if match:
                value = match.group(2).strip().strip("\"'").encode()
                if len(value) >= 16 and not any(marker in value.lower() for marker in [b"your_", b"example", b"change_me", b"mock", b"synthetic"]):
                    private_values.add(value)
selected = []
for name in sorted(set(files)):
    relative = Path(name)
    source = root / relative
    if not name or not source.is_file() or source.is_symlink():
        continue
    if any(part in excluded_dirs for part in relative.parts) or relative.suffix.lower() in excluded_suffixes:
        continue
    if relative.name.startswith(".env") and relative.name != ".env.example":
        continue
    if relative.name in {"prepare-review.cjs", "review-verify.cjs"}:
        continue
    data = source.read_bytes()
    # Existing redaction tests deliberately contain token-shaped synthetic literals.
    scanned = credential.sub(b"[SYNTHETIC REDACTION FIXTURE]", data) if name.startswith(("server/src/__tests__/", "test/harness/")) else data
    if credential.search(scanned) or any(value in data for value in private_values):
        raise RuntimeError(f"Possible credential in {name}; inspect privately before packaging")
    selected.append((name, data))
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
    for name, data in selected:
        archive.writestr("PairTalk/" + name.replace("\\", "/"), data)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "PairTalk/server/src/services/starsRefund.ts" in archive.namelist()
    assert "PairTalk/admin/src/components/ui/Dialog.tsx" in archive.namelist()
    assert "PairTalk/landing/src/components/LandingPage.tsx" in archive.namelist()
print(f"ZIP verified: {len(selected)} source files, {output.stat().st_size} bytes")
print(f"SHA256: {hashlib.sha256(output.read_bytes()).hexdigest()}")
print(output)
