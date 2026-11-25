@echo off
chcp 65001 >nul
rem Запуск ІС «Громадський бюджет»: бекенд (https://localhost:7080) і фронтенд (https://localhost:5173)
cd /d "%~dp0"
if not exist ".certs\localhost.pem" (
  dotnet dev-certs https --export-path .certs\localhost.pem --format Pem --no-password
)
rem JWT-ключ живе поза репозиторієм (dotnet user-secrets); для нового клону генеруємо випадковий
pushd backend\CivicBudget.Api
dotnet user-secrets list 2>nul | findstr /c:"Jwt:Key" >nul || (
  for /f %%k in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"') do dotnet user-secrets set "Jwt:Key" "%%k" >nul
)
popd
if not exist "frontend\node_modules" (
  pushd frontend & call npm install & popd
)
start "CivicBudget API" cmd /k "cd /d backend\CivicBudget.Api && dotnet run --launch-profile https"
start "CivicBudget Web" cmd /k "cd /d frontend && npm run dev"
echo Чекаємо запуску...
timeout /t 15 /nobreak >nul
start "" https://localhost:5173
