@echo off
chcp 65001 >nul
title KAmesh — Создание keystore для RuStore

echo ============================================
echo  KAmesh — Создание Keystore для RuStore
echo ============================================
echo.
echo  Этот скрипт создаёт JKS-файл для подписи APK.
echo  Сохрани пароли — они понадобятся при загрузке в RuStore.
echo.

:: Проверка keytool
where keytool >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] keytool не найден. Установи JDK 17+:
    echo   https://adoptium.net
    pause
    exit /b 1
)

set KEYSTORE_FILE=kamesh-keystore.jks
set KEY_ALIAS=kamesh

echo Введите данные для сертификата (все поля на русском или английском):
echo.
set /p VALIDITY="Срок действия (лет, по умолч. 25): "
if "%VALIDITY%"=="" set VALIDITY=25

set /p CN="Имя и фамилия (CN): "
set /p OU="Отдел (OU): "
set /p O="Организация (O): "
set /p L="Город (L): "
set /p ST="Регион (ST): "
set /p C="Код страны (RU): "
if "%C%"=="" set C=RU

echo.
echo  ============================================
echo  ВАЖНО: Запомни или запиши пароль!
echo  ============================================
echo.

keytool -genkey -v -keystore "%KEYSTORE_FILE%" ^
  -alias "%KEY_ALIAS%" ^
  -keyalg RSA -keysize 2048 -validity %VALIDITY% ^
  -dname "CN=%CN%, OU=%OU%, O=%O%, L=%L%, ST=%ST%, C=%C%"

if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось создать keystore
    pause
    exit /b 1
)

echo.
echo [OK] Keystore создан: %KEYSTORE_FILE%
echo.
echo  Далее:
echo   1. Загрузи %KEYSTORE_FILE% в EAS Credentials:
echo        eas credentials --platform android
echo   2. ИЛИ укажи в app.json:
echo        "expo.android.config.keystore" = "./%KEYSTORE_FILE%"
echo        "expo.android.config.keystorePassword" = "твой-пароль"
echo        "expo.android.config.keyAlias" = "%KEY_ALIAS%"
echo        "expo.android.config.keyPassword" = "твой-пароль"
echo.
echo   3. Запусти сборку для RuStore:
echo        npm run rustore:apk
echo.
pause
