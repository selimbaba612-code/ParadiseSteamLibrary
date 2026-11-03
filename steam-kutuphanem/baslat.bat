@echo off
title Steam Kutuphanem
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Ilk calistirma: bagimliliklar kuruluyor...
  call npm install
)
call npm start
