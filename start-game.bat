@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title RE:FRAME - Game Server
pushd "%~dp0"
if errorlevel 1 goto folder_error
where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\launch-game.mjs %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Startup failed. See the message above or README.md.
  pause
)
popd
exit /b %RESULT%

:missing_node
echo.
echo Node.js was not found. Install Node.js 24 LTS with npm:
echo https://nodejs.org/ja
echo Then close this window and double-click start-game.bat again.
echo.
pause
popd
exit /b 1

:folder_error
echo Cannot open the game folder. Extract or clone the whole project first.
pause
exit /b 1
