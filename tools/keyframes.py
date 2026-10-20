import sys, json
# usage: keyframes.py track.json every_s t0 t1 [t0 t1 ...] -> strictly increasing rpm keyframes
path = sys.argv[1]; every = float(sys.argv[2])
spans = [(float(sys.argv[i]), float(sys.argv[i + 1])) for i in range(3, len(sys.argv), 2)]
d = json.load(open(path))
kf = []
last_t = -1e9
for t0, t1 in spans:
    for t, rpm, conf in zip(d['t'], d['rpm'], d['conf']):
        if t < t0 or t > t1: continue
        if kf and rpm <= kf[-1]['rpm']: continue
        if t - last_t < every and kf and not (t > t1 - every / 2): continue
        kf.append({'t': round(t, 2), 'rpm': int(rpm)})
        last_t = t
print(json.dumps(kf))
print(f'# {len(kf)} keyframes, {kf[0]["t"]}s..{kf[-1]["t"]}s, {kf[0]["rpm"]}..{kf[-1]["rpm"]} rpm', file=sys.stderr)
