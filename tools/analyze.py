"""
Track engine rpm through a recording.

usage: python -I analyze.py <audio file> <cylinders> [--step 0.25] [--rpm-min 500] [--rpm-max 9000] [--json out.json]

For a four-stroke engine the dominant exhaust tone is the firing frequency,
cylinders/2 pulses per revolution, so rpm = f0 * 60 / (cylinders/2).
Each frame gets a harmonic-sum score over candidate f0 values; a Viterbi
pass then picks the smoothest path through the per-frame candidates, which
avoids the octave jumps a per-frame argmax makes.
"""
import argparse
import json
import math
import sys

import numpy as np
import soundfile as sf

p = argparse.ArgumentParser()
p.add_argument("path")
p.add_argument("cylinders", type=int)
p.add_argument("--step", type=float, default=0.25, help="seconds between printed rows")
p.add_argument("--rpm-min", type=float, default=500)
p.add_argument("--rpm-max", type=float, default=9000)
p.add_argument("--json", default=None)
p.add_argument("--start", type=float, default=0.0)
p.add_argument("--end", type=float, default=None)
a = p.parse_args()

x, sr = sf.read(a.path, always_2d=True, dtype="float32")
x = x.mean(axis=1)
if a.end is not None:
    x = x[: int(a.end * sr)]
x = x[int(a.start * sr) :]
dur = len(x) / sr
firings = a.cylinders / 2.0
fmin = a.rpm_min / 60.0 * firings
fmax = a.rpm_max / 60.0 * firings

win = 8192 if sr <= 48000 else 16384
hop = 1024
nfft = win * 2
window = np.hanning(win).astype(np.float32)
freqs = np.fft.rfftfreq(nfft, 1.0 / sr)

# Candidate fundamentals on a log grid, ~1.5% apart.
cands = np.exp(np.arange(math.log(fmin), math.log(fmax), math.log(1.015)))
harmonics = np.arange(1, 9)
weights = 1.0 / harmonics  # lower harmonics count more

frames = []
times = []
rms = []
for start in range(0, max(1, len(x) - win), hop):
    seg = x[start : start + win]
    if len(seg) < win:
        seg = np.pad(seg, (0, win - len(seg)))
    rms.append(float(np.sqrt(np.mean(seg**2)) + 1e-9))
    spec = np.abs(np.fft.rfft(seg * window, nfft))
    spec = np.log1p(spec * 50)
    # score(f0) = sum_k w_k * spec(k f0)
    score = np.zeros(len(cands))
    for k, w in zip(harmonics, weights):
        idx = np.clip(np.round(cands * k / (sr / nfft)).astype(int), 0, len(spec) - 1)
        score += w * spec[idx]
    frames.append(score)
    times.append((start + win / 2) / sr)

S = np.array(frames)  # frames x cands
T, C = S.shape
# Normalise per frame so loud frames do not dominate path costs.
S = (S - S.mean(axis=1, keepdims=True)) / (S.std(axis=1, keepdims=True) + 1e-6)

# Viterbi: maximise sum of scores minus a jump penalty in log-frequency.
log_c = np.log(cands)
penalty = float(__import__("os").environ.get("PEN", "60"))
D = np.zeros((T, C))
B = np.zeros((T, C), dtype=int)
D[0] = S[0]
for t in range(1, T):
    # transition cost from j to i: penalty * |log_c[i] - log_c[j]| / ln 2
    # vectorised over a band of +-12 candidates (~20%) to keep it quick
    best = np.full(C, -np.inf)
    arg = np.zeros(C, dtype=int)
    for d in range(-12, 13):
        src = np.arange(C) - d
        ok = (src >= 0) & (src < C)
        cost = penalty * abs(d) * math.log(1.015) / math.log(2)
        val = np.full(C, -np.inf)
        val[ok] = D[t - 1][src[ok]] - cost
        better = val > best
        best[better] = val[better]
        arg[better] = src[better]
    D[t] = S[t] + best
    B[t] = arg
path = np.zeros(T, dtype=int)
path[-1] = int(np.argmax(D[-1]))
for t in range(T - 1, 0, -1):
    path[t - 1] = B[t][path[t]]

f0 = cands[path]
rpm = f0 * 60.0 / firings
rms_db = 20 * np.log10(np.array(rms))

print(f"# {a.path}: {dur:.2f}s @ {sr} Hz, {a.cylinders} cyl, rpm range {a.rpm_min:.0f}-{a.rpm_max:.0f}")
print(f"# {'t':>7} {'rpm':>6} {'f0Hz':>7} {'dB':>6}  conf")
step_frames = max(1, int(a.step * sr / hop))
for i in range(0, T, step_frames):
    conf = float(S[i][path[i]])
    print(f"  {times[i] + a.start:7.2f} {rpm[i]:6.0f} {f0[i]:7.1f} {rms_db[i]:6.1f}  {conf:4.1f}")

if a.json:
    with open(a.json, "w") as fh:
        json.dump(
            {
                "path": a.path,
                "sr": sr,
                "cylinders": a.cylinders,
                "t": [round(float(t) + a.start, 3) for t in times],
                "rpm": [round(float(r)) for r in rpm],
                "db": [round(float(d), 1) for d in rms_db],
                "conf": [round(float(S[i][path[i]]), 2) for i in range(T)],
            },
            fh,
        )
    print(f"# wrote {a.json}", file=sys.stderr)
