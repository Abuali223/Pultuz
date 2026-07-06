@echo off
chcp 65001 >nul
setlocal
set PROJECT=pultuz
echo =====================================================
echo  Pult Uz - DEPLOY (Windows)
echo =====================================================
echo.

echo [1/4] Node.js tekshiruvi...
where node >nul 2>nul
if errorlevel 1 goto NONODE

echo [2/4] Firebase CLI tekshiruvi...
where firebase >nul 2>nul
if errorlevel 1 goto NOFIRE

echo [3/4] Firebase login (brauzer ochiladi)...
call firebase login

echo [4/4] DEPLOY (functions + rules + hosting) - Storage tashlab yuboriladi...
call firebase deploy --only functions,firestore,hosting --project %PROJECT%

echo.
echo =====================================================
echo  TAYYOR! Saytni oching va Ctrl+F5 bosing: https://alilazer.uz
echo =====================================================
pause
goto END

:NONODE
echo XATO: Node.js topilmadi. https://nodejs.org dan LTS o'rnating va CMD ni qayta oching.
pause
goto END

:NOFIRE
echo XATO: Firebase CLI topilmadi.
echo O'rnatish uchun yozing:   npm install -g firebase-tools
echo Keyin CMD oynasini yopib qayta oching va deploy.bat ni qayta ishga tushiring.
pause
goto END

:END
