@echo off
setlocal
title Steam Kutuphanem
cd /d "%~dp0"
if not exist "node_modules\electron\package.json" goto notinstalled
echo Steam Kutuphanem aciliyor... (bu pencere kapanirsa hata vardir, log dosyasina bakilir)
call npm start > "calisma-log.txt" 2>&1
if errorlevel 1 goto runfail
exit /b 0

:notinstalled
echo.
echo Once "kur.bat" dosyasini calistirman gerekiyor (bir kerelik kurulum).
echo.
pause
exit /b 1

:runfail
echo.
echo Uygulama baslatilamadi. Son satirlar:
echo ------------------------------------------------
powershell -NoProfile -Command "Get-Content -Path 'calisma-log.txt' -Tail 25"
echo ------------------------------------------------
echo Tamami calisma-log.txt dosyasinda.
echo.
pause
exit /b 1
