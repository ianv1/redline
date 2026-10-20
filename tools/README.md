# Pack tools

Scripts used to place the rpm keyframes in each `public/sounds/<pack>/pack.json`.
They need Python 3 with `numpy` and `soundfile` (`pip install numpy soundfile`).
Run them with `python -I` on recordings kept outside the repo.

- `analyze.py <file> <cylinders> [--step s] [--start s] [--end s] [--json out]`
  tracks engine speed through a recording: a harmonic-sum score over candidate
  firing frequencies per frame, then a Viterbi pass for a smooth path. Set the
  environment variable `PEN` (default 60, per octave per frame) lower, e.g. 8,
  to let it follow fast throttle blips.
- `peaks.py <file> <step> [start end]` prints the strongest raw spectral peaks
  over time, for checking the tracker's octave or spotting exhaust resonances
  that fool it.
- `keyframes.py <track.json> <every_s> <t0> <t1> [<t0> <t1> ...]` turns a
  tracked span (or several, chained) into strictly increasing keyframes.

Four-stroke firing frequency is rpm / 60 x cylinders / 2; the tracker reports
rpm on that basis, so give it the real cylinder count.
