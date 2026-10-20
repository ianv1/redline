# Tesla Model S Plaid motor pack

`source.mp3` is the Freesound preview of **"Acceleration of an electric car"
by justVova**, https://freesound.org/people/justVova/sounds/761685/.

The uploader's description: the sound of a Tesla Model S Plaid accelerating at
full throttle. Five seconds of rising motor and inverter whine over wind and
road noise.

**Licence:** Creative Commons CC0 1.0 (public domain dedication),
https://creativecommons.org/publicdomain/zero/1.0/. No attribution is
required; this file records where the sound came from anyway.

`pack.json` is keyed to road speed rather than engine speed: its `rpm` values
are km/h multiplied by 50. The whine's pitch is proportional to motor speed
and so to road speed, so the whine ridge was tracked through the clip (about
560 Hz at the start to 3.2 kHz at the end) and mapped to speed with the end of
the clip taken as 160 km/h, which puts the rolling start near 28 km/h and
100 km/h at about 2.6 s. The speed scale is an estimate; nothing in the
recording states the car's actual speed. There is no idle loop, since a Tesla
is silent at rest: the player fades the sound out below 15 km/h.
