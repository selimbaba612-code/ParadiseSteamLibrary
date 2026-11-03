@echo off
title Steam Kutuphanem - Kurulum
cd /d "%~dp0"
echo Steam Kutuphanem kuruluyor...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi!
  echo Lutfen https://nodejs.org adresinden LTS surumu kurup tekrar deneyin.
  echo.
  pause
  exit /b 1
)
call npm install
echo.
echo Kurulum tamamlandi. Uygulamayi acmak icin baslat.bat dosyasina cift tiklayin.
echo.
pause
