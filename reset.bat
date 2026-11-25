@echo off
chcp 65001 >nul
rem Скидання БД CivicBudget до демо-стану (перед цим закрийте вікно "CivicBudget API")
cd /d "%~dp0"
taskkill /im CivicBudget.Api.exe /f >nul 2>&1
powershell -ExecutionPolicy Bypass -File db\reset.ps1
pause
