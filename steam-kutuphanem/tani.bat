@echo off
setlocal
title Steam Kutuphanem - Tani Raporu
cd /d "%~dp0"
set RAPOR=tani.txt
echo Steam Kutuphanem tani raporu > "%RAPOR%"
echo Tarih: %DATE% %TIME% >> "%RAPOR%"
echo Klasor: %CD% >> "%RAPOR%"
echo. >> "%RAPOR%"
echo --- node -v --- >> "%RAPOR%"
node -v >> "%RAPOR%" 2>&1
echo --- npm -v --- >> "%RAPOR%"
npm -v >> "%RAPOR%" 2>&1
echo --- node_modules var mi --- >> "%RAPOR%"
if exist "node_modules\electron\package.json" (echo VAR >> "%RAPOR%") else (echo YOK >> "%RAPOR%")
echo --- Steam klasorleri --- >> "%RAPOR%"
if exist "C:\Program Files (x86)\Steam\steamapps" echo BULUNDU: C:\Program Files (x86)\Steam >> "%RAPOR%"
if exist "C:\Program Files\Steam\steamapps" echo BULUNDU: C:\Program Files\Steam >> "%RAPOR%"
if exist "C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf" (echo libraryfolders.vdf: VAR >> "%RAPOR%") else (echo libraryfolders.vdf: YOK veya farkli klasorde >> "%RAPOR%")
echo --- kurulum-log.txt (varsa son 15 satir) --- >> "%RAPOR%"
if exist "kurulum-log.txt" powershell -NoProfile -Command "Get-Content -Path 'kurulum-log.txt' -Tail 15" >> "%RAPOR%" 2>&1
echo --- calisma-log.txt (varsa son 15 satir) --- >> "%RAPOR%"
if exist "calisma-log.txt" powershell -NoProfile -Command "Get-Content -Path 'calisma-log.txt' -Tail 15" >> "%RAPOR%" 2>&1
echo.
echo Rapor olusturuldu: %RAPOR%
start notepad "%RAPOR%"
