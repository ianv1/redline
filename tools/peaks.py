import sys, numpy as np, soundfile as sf
# usage: peaks.py file step [start end]  -> strongest 4 spectral peaks 20-1200 Hz at each step
path = sys.argv[1]; step = float(sys.argv[2])
start = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
end = float(sys.argv[4]) if len(sys.argv) > 4 else None
x, sr = sf.read(path, always_2d=True, dtype='float32'); x = x.mean(1)
win = 16384 if sr > 46000 else 8192 * 2
w = np.hanning(win)
freqs = np.fft.rfftfreq(win, 1 / sr)
lo, hi = np.searchsorted(freqs, 20), np.searchsorted(freqs, 1200)
t = start
print(f'# {path} peaks (Hz:dB), every {step}s')
while t * sr + win < len(x) and (end is None or t <= end):
    seg = x[int(t * sr): int(t * sr) + win] * w
    mag = 20 * np.log10(np.abs(np.fft.rfft(seg)) + 1e-9)
    band = mag[lo:hi]
    # local maxima
    idx = [i for i in range(2, len(band) - 2) if band[i] > band[i-1] and band[i] >= band[i+1] and band[i] > band[i-2] and band[i] >= band[i+2]]
    idx.sort(key=lambda i: -band[i])
    top = idx[:4]
    rms = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
    print(f'{t:6.2f}  rms {rms:6.1f}  ' + '  '.join(f'{freqs[lo + i]:6.1f}:{band[i]:5.0f}' for i in top))
    t += step
