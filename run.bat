@echo off
setlocal
cd /d "%~dp0"

rem Usage: run.bat [path\to\image]   (default: input\eiffel.jpeg)
set "filename=%~1"
if "%filename%"=="" set "filename=input\eiffel.jpeg"

rem Pick a Python launcher
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")

if not exist venv (
    %PY% -m venv venv || goto :err
)
call venv\Scripts\activate.bat || goto :err

python -m pip install -r requirements.txt || goto :err

python src\main.py "%filename%" || goto :err
echo Done. Output saved to output\16.png
goto :eof

:err
echo Failed. Make sure Python 3.10+ is installed and on PATH.
exit /b 1
