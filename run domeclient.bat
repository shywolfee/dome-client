@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b %errorlevel%
)
if not exist ".env" if exist ".env-example-local" copy /Y ".env-example-local" ".env" >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$envPath = Join-Path (Get-Location) '.env'; $lines = Get-Content -LiteralPath $envPath; if ($lines -match '^MULTI_MUD=') { $lines = $lines -replace '^MULTI_MUD=.*$', 'MULTI_MUD=true' } else { $lines += 'MULTI_MUD=true' }; [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$envPath = Join-Path (Get-Location) '.env'; $lines = Get-Content -LiteralPath $envPath; if ($lines -match '^MUD_TLS_ENABLED=') { $lines = $lines -replace '^MUD_TLS_ENABLED=.*$', 'MUD_TLS_ENABLED=true' } else { $lines += 'MUD_TLS_ENABLED=true' }; [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))"
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%

set "DOME_PORT=8080"
for /f "tokens=1,2 delims==" %%A in ('findstr /b "NODE_PORT=" ".env" 2^>nul') do set "DOME_PORT=%%B"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'src[\\\\/]server\\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
start "Dome Client Server" /D "%~dp0" cmd /k "npm.cmd start"
set "DOME_URL=http://localhost:%DOME_PORT%"
set "DOME_READY="
for /L %%N in (1,1,30) do (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri '%DOME_URL%/' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
  if not errorlevel 1 (
    set "DOME_READY=true"
    goto :open_dome_client
  )
  timeout /t 1 /nobreak >nul
)
:open_dome_client
if defined DOME_READY start "" "%DOME_URL%"
if not defined DOME_READY echo Dome Client did not become available at %DOME_URL% within 30 seconds.
endlocal
