@echo off
chcp 65001 >nul
title KAmesh — Deploy

echo ============================================
echo  KAmesh — Сборка и деплой
echo ============================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Установи: https://nodejs.org
    pause
    exit /b 1
)

:: Меню
echo Выбери цель:
echo   [1] APK для телефона (прямая установка)
echo   [2] APK для RuStore
echo   [3] AAB для RuStore (авто-обновления)
echo   [4] Keystore (RuStore)
echo   [5] ПК-превью (веб, посмотреть интерфейс)
echo   [6] Альфа-тест (internal distribution)
echo.
set /p TARGET="Цель (1-6): "

:: Проверка npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm не найден.
    pause
    exit /b 1
)

:: Проверка eas-cli
where eas >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] eas-cli не найден. Устанавливаю...
    npm i -g eas-cli
)

:: Установка зависимостей
echo [1/4] Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm install
    pause
    exit /b 1
)

:: Проверка TypeScript
echo [2/4] Проверка типов...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo [ПРЕДУПРЕЖДЕНИЕ] Ошибки TypeScript
)

:: Проверка Expo config
echo [3/4] Проверка конфигурации...
call npx expo config >nul 2>&1

:: Билд
echo [4/4] Запуск сборки...
echo.
if "%TARGET%"=="1" (
    echo Сборка APK для телефона...
    call npm run build:phone
) else if "%TARGET%"=="2" (
    echo Сборка APK для RuStore...
    call npm run rustore:apk
) else if "%TARGET%"=="3" (
    echo Сборка AAB для RuStore...
    call npm run rustore:aab
) else if "%TARGET%"=="4" (
    echo Создание keystore...
    call create-keystore.bat
) else if "%TARGET%"=="5" (
    echo Запуск ПК-превью...
    echo.
    cd pc-preview
    if not exist "node_modules" (
        call npm install
    )
    call npm run dev
    cd ..
) else if "%TARGET%"=="6" (
    echo Сборка APK для альфа-теста...
    call npm run build:phone
) else (
    echo Неверный выбор. По умолчанию: APK для телефона.
    call npm run build:phone
)

echo.
echo ============================================
echo  Готово! APK/AAB будет доступен по ссылке.
echo ============================================
pause
