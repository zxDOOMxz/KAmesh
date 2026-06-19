@echo off
chcp 65001 >nul
title KAmesh — Build for RuStore

echo ============================================
echo  KAmesh — Сборка для RuStore
echo ============================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Установи: https://nodejs.org
    pause
    exit /b 1
)

:: Выбор формата
echo Выбери формат сборки:
echo   [1] APK — для загрузки в RuStore (рекомендуется)
echo   [2] AAB — для авто-обновлений через RuStore
echo.
set /p CHOICE="Формат (1/2): "

:: Проверка keystore
if not exist "kamesh-keystore.jks" (
    echo.
    echo [ПРЕДУПРЕЖДЕНИЕ] Keystore не найден!
    echo   Создай его: create-keystore.bat
    echo   Или EAS подпишет своим сертификатом.
    echo.
    choice /m "Продолжить без локального keystore?"
    if errorlevel 2 exit /b 1
)

:: Установка зависимостей
echo.
echo [1/4] Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm install
    pause
    exit /b 1
)

:: Проверка eas-cli
echo [2/4] Проверка eas-cli...
where eas >nul 2>&1
if %errorlevel% neq 0 (
    echo eas-cli не найден. Устанавливаю...
    npm i -g eas-cli
)

:: Проверка конфигурации
echo [3/4] Проверка конфигурации Expo...
call npx expo config 2>nul
if %errorlevel% neq 0 (
    echo [ПРЕДУПРЕЖДЕНИЕ] expo config вернул ошибки, но продолжаем...
)

:: Сборка
echo [4/4] Запуск EAS Build...
echo.
if "%CHOICE%"=="2" (
    echo Сборка AAB для RuStore...
    echo.
    call npm run rustore:aab
) else (
    echo Сборка APK для RuStore...
    echo.
    call npm run rustore:apk
)

echo.
echo ============================================
echo  Готово! После завершения билда EAS выдаст
echo  ссылку на скачивание APK/AAB.
echo ============================================
echo.
echo  Инструкция по загрузке в RuStore:
echo   1. Перейди на https://partner.rustore.ru
echo   2. Создай новое приложение
echo   3. Загрузи полученный APK/AAB
echo   4. Заполни описание, категорию, скриншоты
echo   5. Отправь на модерацию
echo.
pause
