@echo off
chcp 65001 >nul
title KAmesh — Cleanup

echo ============================================
echo  KAmesh — Очистка установочных файлов
echo ============================================
echo.

:: Удаление node_modules
if exist "node_modules" (
    echo [1/5] Удаление node_modules...
    rmdir /s /q node_modules
    echo   OK
) else (
    echo [1/5] node_modules не найдены
)

:: Удаление кэша Expo
if exist ".expo" (
    echo [2/5] Удаление .expo кэша...
    rmdir /s /q .expo
    echo   OK
) else (
    echo [2/5] .expo кэш не найден
)

:: Удаление логов
if exist "*.log" (
    echo [3/5] Удаление лог-файлов...
    del /q *.log 2>nul
    echo   OK
) else (
    echo [3/5] Лог-файлы не найдены
)

:: Удаление сборок iOS
if exist "ios\Pods" (
    echo [4/5] Удаление iOS Pods...
    rmdir /s /q ios\Pods
    echo   OK
) else (
    echo [4/5] iOS Pods не найдены
)
if exist "ios\build" (
    rmdir /s /q ios\build
    echo   iOS build удалён
)

:: Удаление сборок Android
if exist "android\.gradle" (
    echo [5/5] Удаление Android .gradle...
    rmdir /s /q android\.gradle
    echo   OK
) else (
    echo [5/5] Android .gradle не найден
)
if exist "android\app\build" (
    rmdir /s /q android\app\build
    echo   Android build удалён
)
if exist "android\build" (
    rmdir /s /q android\build
    echo   Android build удалён
)

:: Очистка кэша npm
echo.
echo Очистка кэша npm...
call npm cache clean --force 2>nul

:: Удаление keystore-бэкапов (если есть)
if exist "kamesh-keystore.jks~" (
    del /q kamesh-keystore.jks~ 2>nul
    echo   Keystore backup удалён
)

:: Удаление билдов Expo/EAS
if exist "dist" (
    rmdir /s /q dist
    echo   dist/ удалён
)

:: Удаление node_modules в pc-preview
if exist "pc-preview\node_modules" (
    rmdir /s /q "pc-preview\node_modules"
    echo   pc-preview\node_modules удалён
)

echo.
echo ============================================
echo  Очистка завершена.
echo  Проект готов к повторной сборке.
echo  Чтобы переустановить всё:
echo    npm install
echo.
echo  Для ПК-превью:
echo    cd pc-preview ^&^& npm install ^&^& npm run dev
echo.
echo  Для RuStore:
echo    create-keystore.bat    — создать ключ подписи
echo    build-rustore.bat      — собрать APK/AAB
echo ============================================
pause
