# placeholder-art

Generates the 24 original placeholder character images (4 characters x 6 emotions, 512x512 transparent PNG).

- `make-svg.js` reads `js/data/characters.js` and writes `svg/<id>-<emotion>.svg` (svg/ is git-ignored, regenerable).
- `render-png.js` renders each SVG with headless Chrome into `assets/characters/<id>/<emotion>.png`.
- Run: `tools\placeholder-art\render-png.bat` (set `CHROME_PATH` if Chrome is not in the default location).

The designs are simple geometric faces, not copies of any official art. Replace the PNGs with real art later; keep the file names.
