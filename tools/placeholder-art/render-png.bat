@echo off
rem Regenerates placeholder SVGs and renders them to assets/characters/ID/EMOTION.png (needs Chrome + Node).
setlocal
cd /d "%~dp0..\.."
node tools\placeholder-art\make-svg.js || exit /b 1
node tools\placeholder-art\render-png.js || exit /b 1
