@echo off
title Offline Exam System
color 1F
cls
echo.
echo  ============================================
echo    OFFLINE EXAM SYSTEM - Starting...
echo  ============================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 4F
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Download the LTS version and run the installer.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found.
echo.

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo  Installing dependencies... Please wait...
    echo.
    npm install
    echo.
)

echo  [OK] Dependencies ready.
echo.
echo  ============================================
echo    SERVER IS STARTING...
echo  ============================================
echo.
echo  Once started, you will see the IP address.
echo  Share that IP with your students.
echo.
echo  Teacher Dashboard : http://[IP]:3000/teacher
echo  Student Portal    : http://[IP]:3000
echo.
echo  Press Ctrl+C to stop the server.
echo  ============================================
echo.

node server.js

pause
