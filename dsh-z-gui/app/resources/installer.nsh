; dsh-gui 自定义 NSIS 脚本（electron-builder nsis.include 注入）
;
; 功能：
;  1. 安装时检测外部必需环境 —— VC++ 2015-2022 Redistributable (x64)，
;     缺失则自动运行随安装包分发的 vc_redist.x64.exe 静默安装。
;  2. 安装详情：所有检查/安装结果通过 DetailPrint 写入 NSIS 日志，
;     用户可在安装详情页（Show details）查看完整过程。

; ---------------------------------------------------------------------------
; 仅安装器包含自定义安装逻辑（卸载器构建 BUILD_UNINSTALLER 时排除，
; 避免 "install function not referenced" warning 6010 被当作 error）。
; ---------------------------------------------------------------------------
!ifndef BUILD_UNINSTALLER

; ---------------------------------------------------------------------------
; customInstall —— 在应用文件复制完成后执行（section 上下文，File 合法）。
; ---------------------------------------------------------------------------
!macro customInstall
  ; 把随附的 VC++ 运行库依赖包复制到 NSIS 插件目录
  SetOutPath $PLUGINSDIR
  File "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
  SetOutPath $INSTDIR
  ; 检测并自动安装
  Call ensureVCPlusPlus
!macroend

; ---------------------------------------------------------------------------
; ensureVCPlusPlus —— 检测 HKLM 注册表，缺失则静默安装依赖包。
; 注册表：HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64\Installed = 1
; （VC++ 2015-2022 Redistributable 的统一检测位置）
; ---------------------------------------------------------------------------
Function ensureVCPlusPlus
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  IntCmp $0 1 vcPresent
  DetailPrint "=================================================="
  DetailPrint "环境检查：缺少 VC++ 2015-2022 Redistributable (x64)"
  DetailPrint "开始自动安装随附依赖包 vc_redist.x64.exe ..."
  DetailPrint "=================================================="
  ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $1
  DetailPrint "vc_redist.x64.exe 安装结束，退出码 $1"
  IntCmp $1 0 vcDone
  DetailPrint "警告：VC++ 运行库自动安装未成功（退出码 $1）。"
  DetailPrint "提示：请以管理员身份手动运行安装目录下的 vc_redist.x64.exe，"
  DetailPrint "      或重新安装本应用以再次自动安装该依赖。"
  Goto vcDone
vcPresent:
  DetailPrint "环境检查：VC++ 2015-2022 Redistributable (x64) 已安装，无需处理。"
vcDone:
  SetRegView lastused
FunctionEnd

!endif
