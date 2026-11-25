# Перестворює БД CivicBudget, заливає демо-дані й демо-файли (запуск: powershell -ExecutionPolicy Bypass -File db\reset.ps1).
# Перед цим зупиніть бекенд, інакше DROP DATABASE може чекати на відкриті з'єднання.
$ErrorActionPreference = 'Stop'
$server = 'np:\\.\pipe\MSSQL$SQLEXPRESS\sql\query'   # SQL Browser вимкнено, тому іменований канал
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = Join-Path (Split-Path -Parent $dir) 'backend\CivicBudget.Api'

sqlcmd -S $server -E -C -b -i (Join-Path $dir 'CivicBudget_create.sql') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Помилка в CivicBudget_create.sql' }
Write-Host 'CivicBudget_create.sql — OK'

sqlcmd -S $server -E -C -b -W -s '|' -i (Join-Path $dir 'CivicBudget_demo.sql')
if ($LASTEXITCODE -ne 0) { throw 'Помилка в CivicBudget_demo.sql' }
Write-Host 'CivicBudget_demo.sql — OK'

# файли вкладень (Attachment.StorageKey) — у папці uploads/ бекенду; листи-імітації — у mail-outbox/
$uploads = Join-Path $api 'uploads'
$outbox = Join-Path $api 'mail-outbox'
foreach ($d in $uploads, $outbox) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
New-Item -ItemType Directory -Force $uploads, $outbox | Out-Null
Copy-Item -Recurse -Force (Join-Path $dir 'demo-files\*') $uploads
Write-Host "Демо-файли скопійовано в $uploads"
