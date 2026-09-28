@echo off
title Push Sleepy Owl RTD Dashboard to GitHub
cd /d "C:\Users\LPTP-028\sleepy-owl-rtd-dashboard"

echo ==============================================================
echo   Pushing Sleepy Owl RTD Dashboard to GitHub
echo ==============================================================
echo.
echo A GitHub sign-in window may pop up the first time you do this.
echo If it does, sign in / click "Authorize" to continue.
echo.

git push -u origin main

echo.
echo ==============================================================
if %errorlevel%==0 (
  echo   SUCCESS - your code is now on GitHub.
) else (
  echo   Something went wrong ^(see the messages above^).
  echo   Copy the red/error text and paste it to Claude.
)
echo ==============================================================
echo.
pause
