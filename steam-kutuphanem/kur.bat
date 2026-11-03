@echo off
setlocal
title Steam Kutuphanem - Kurulum
cd /d "%~dp0"
echo ===============================================
echo  Steam Kutuphanem - Kurulum
echo ===============================================
echo.
echo [1/3] Node.js kontrol ediliyor...
where node >nul 2>nul
if errorlevel 1 goto nonode
where npm >nul 2>nul
if errorlevel 1 goto nonode
echo        Node.js bulundu:
node -v
echo.
echo [2/3] Bagimliliklar kuruluyor (ilk seferde birkac dakika surebilir)...
call npm install --no-audit --no-fund > "kurulum-log.txt" 2>&1
if errorlevel 1 goto fail
echo        Tamam.
echo.
echo [3/3] Kurulum bitti.
echo.
echo Simdi "baslat.bat" dosyasina cift tiklayarak uygulamayi acabilirsin.
echo.
pause
exit /b 0

:nonode
echo.
echo HATA: Node.js bulunamadi.
echo 1) https://nodejs.org adresinden "LTS" surumunu indir ve kur.
echo 2) Kurulum bitince bilgisayari yeniden baslat.
echo 3) Bu dosyayi tekrar calistir.
echo.
pause
exit /b 1

:fail
echo.
echo HATA: "npm install" basarisiz oldu.
echo Asagida son satirlar var, tamami kurulum-log.txt dosyasinda:
echo ------------------------------------------------
powershell -NoProfile -Command "Get-Content -Path 'kurulum-log.txt' -Tail 25"
echo ------------------------------------------------
echo Cozum onerisi: internet baglantisini kontrol et, ardindan bu dosyayi tekrar calistir.
echo.
pause
exit /b 1
