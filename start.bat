@echo off
chcp 65001 >nul
rem Запуск ІС «Громадський бюджет»: бекенд (https://localhost:7080) і фронтенд (https://localhost:5173)
cd /d "%~dp0"
if not exist ".certs\localhost.pem" (
  dotnet dev-certs https --export-path .certs\localhost.pem --format Pem --no-password
)
if not exist "frontend\node_modules" (
  pushd frontend & call npm install & popd
)
start "CivicBudget API" cmd /k "cd /d backend\CivicBudget.Api && dotnet run --launch-profile https"
start "CivicBudget Web" cmd /k "cd /d frontend && npm run dev"
echo Чекаємо запуску...
timeout /t 15 /nobreak >nul
start "" https://localhost:5173
