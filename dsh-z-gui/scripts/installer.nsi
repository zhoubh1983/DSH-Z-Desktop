; DSH Desktop installer - NSIS script
; Per-user install (no admin), wraps the portable build into a Windows installer.
; ASCII-only source: NSIS 3.x without BOM parses the script as ANSI.

Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "DSH Desktop"
OutFile "D:\sourceCode\ai-app\dsh-d\dsh-z-gui\app\release\dsh-gui-0.1.0-win-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\DSH Desktop"
InstallDirRegKey HKCU "Software\DSH Desktop" "InstallDir"
RequestExecutionLevel user

SetCompressor lzma

!define APP_NAME "DSH Desktop"
!define APP_VERSION "0.1.0"
!define APP_EXE "DSH Desktop.exe"
!define APP_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

; Source tree: the portable build (Electron + shell app + dsh-runtime + builtin plugins)
!define SRC_TREE "D:\sourceCode\ai-app\dsh-d\dsh-z-gui\app\release\dsh-gui-win-x64"

!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Run DSH Desktop"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Clean reinstall: wipe any previous install under this dir.
  ; User data lives in %USERPROFILE%\.dsh, never inside $INSTDIR.
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"

  ; Ship the whole portable tree (DSH Desktop.exe + resources).
  File /r "${SRC_TREE}\*.*"

  ; Start menu shortcut
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Uninstaller + Add/Remove Programs entry
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${APP_UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${APP_UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${APP_UNINST_KEY}" "Publisher" "dsh"
  WriteRegStr HKCU "${APP_UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${APP_UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${APP_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${APP_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${APP_UNINST_KEY}" "NoRepair" 1
  WriteRegStr HKCU "Software\DSH Desktop" "InstallDir" "$INSTDIR"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\uninstall.exe"
  ; /REBOOTOK marks files locked by other processes (AV scanning, etc.)
  ; for deletion on the next reboot so uninstall always completes.
  RMDir /r /REBOOTOK "$INSTDIR"
  Delete /REBOOTOK "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete /REBOOTOK "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKCU "${APP_UNINST_KEY}"
  DeleteRegKey HKCU "Software\DSH Desktop"
SectionEnd
