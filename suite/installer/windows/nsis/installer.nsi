# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Also requires:
# AppAssocReg http://nsis.sourceforge.net/Application_Association_Registration_plug-in
# CityHash    http://mxr.mozilla.org/mozilla-central/source/other-licenses/nsis/Contrib/CityHash
# ShellLink plugin http://nsis.sourceforge.net/ShellLink_plug-in
# UAC         http://nsis.sourceforge.net/UAC_plug-in

; Set verbosity to 3 (e.g. no script) to lessen the noise in the build logs
!verbose 3

; 7-Zip provides better compression than the lzma from NSIS so we add the files
; uncompressed and use 7-Zip to create a SFX archive of it
SetDatablockOptimize on
SetCompress off
CRCCheck on

RequestExecutionLevel user

Unicode true
ManifestSupportedOS all
ManifestDPIAware true

!addplugindir ./

Var TmpVal
Var StartMenuDir
Var InstallType
Var AddStartMenuSC
Var AddTaskbarSC
Var AddQuickLaunchSC
Var AddDesktopSC
Var InstallMaintenanceService
Var InstallOptionalExtensions
Var RegisterDefaultAgent

; Other included files may depend upon these includes!
; The following includes are provided by NSIS.
!include FileFunc.nsh
!include LogicLib.nsh
!include WinMessages.nsh
!include WinVer.nsh
!include WordFunc.nsh
!include MUI.nsh

!insertmacro StrFilter
!insertmacro GetOptions
!insertmacro GetParameters
!insertmacro GetSize
!insertmacro WordFind

; The following includes are custom.
!include branding.nsi
!include defines.nsi
!include common.nsh
!include locales.nsi

VIAddVersionKey "FileDescription" "${BrandShortName} Installer"
VIAddVersionKey "OriginalFilename" "setup.exe"

; Must be inserted before other macros that use logging
!insertmacro _LoggingCommon

; Most commonly used macros for managing shortcuts
!insertmacro _LoggingShortcutsCommon

!insertmacro AddDisabledDDEHandlerValues
!insertmacro AddHandlerValues
!insertmacro ChangeMUIHeaderImage
!insertmacro CheckForFilesInUse
!insertmacro CheckIfRegistryKeyExists
!insertmacro CleanMaintenanceServiceLogs
!insertmacro CopyFilesFromDir
!insertmacro CreateRegKey
!insertmacro FindSMProgramsDir
!insertmacro GetPathFromString
!insertmacro GetParent
!insertmacro InitHashAppModelId
!insertmacro IsHandlerForInstallDir
!insertmacro ManualCloseAppPrompt
!insertmacro RegCleanMain
!insertmacro RegCleanUninstall
!insertmacro SetBrandNameVars
!insertmacro UnloadUAC
!insertmacro WriteRegStr2
!insertmacro WriteRegDWORD2

!include shared.nsh

; Helper macros for ui callbacks. Insert these after shared.nsh
!insertmacro CheckCustomCommon
!insertmacro InstallEndCleanupCommon
!insertmacro InstallOnInitCommon
!insertmacro InstallStartCleanupCommon
!insertmacro LeaveDirectoryCommon
!insertmacro LeaveOptionsCommon
!insertmacro OnEndCommon
!insertmacro PreDirectoryCommon

Name "${BrandFullName}"
OutFile "setup.exe"
!ifdef HAVE_64BIT_BUILD
  InstallDir "$PROGRAMFILES64\${BrandFullName}\"
!else
  InstallDir "$PROGRAMFILES32\${BrandFullName}\"
!endif
ShowInstDetails nevershow

################################################################################
# Modern User Interface - MUI

!define MUI_ABORTWARNING
!define MUI_ICON setup.ico
!define MUI_UNICON setup.ico
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEFINISHPAGE_BITMAP wizWatermark.bmp

; Use a right to left header image when the language is right to left
!ifdef ${AB_CD}_rtl
!define MUI_HEADERIMAGE_BITMAP_RTL wizHeaderRTL.bmp
!else
!define MUI_HEADERIMAGE_BITMAP wizHeader.bmp
!endif

/**
 * Installation Pages
 */
; Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE preWelcome
!insertmacro MUI_PAGE_WELCOME

; License Page
!define MUI_PAGE_CUSTOMFUNCTION_SHOW showLicense
!define MUI_LICENSEPAGE_CHECKBOX
!insertmacro MUI_PAGE_LICENSE license.txt

; Custom Options Page
Page custom preOptions leaveOptions

; Select Install Directory Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE preDirectory
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE leaveDirectory
!define MUI_DIRECTORYPAGE_VERIFYONLEAVE
!insertmacro MUI_PAGE_DIRECTORY

; Custom Shortcuts Page
Page custom preShortcuts leaveShortcuts

; Start Menu Folder Page Configuration
!define MUI_PAGE_CUSTOMFUNCTION_PRE preStartMenu
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE leaveStartMenu
!define MUI_STARTMENUPAGE_NODISABLE
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuDir

; Custom Summary Page
Page custom preSummary leaveSummary

; Install Files Page
!insertmacro MUI_PAGE_INSTFILES

; Finish Page
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT $(LAUNCH_TEXT)
!define MUI_PAGE_CUSTOMFUNCTION_PRE preFinish
!insertmacro MUI_PAGE_FINISH

; Use the default dialog for IDD_VERIFY for a simple Banner
ChangeUI IDD_VERIFY "${NSISDIR}\Contrib\UIs\default.exe"

################################################################################

; Cleanup operations to perform at the start of the installation.
Section "-InstallStartCleanup"
  SetDetailsPrint both
  DetailPrint $(STATUS_CLEANUP)
  SetDetailsPrint none

  SetOutPath "$INSTDIR"
  ${StartInstallLog} "${BrandFullName}" "${AB_CD}" "${AppVersion}" "${GREVersion}"

  ; Delete the app exe to prevent launching the app while we are installing.
  ClearErrors
  ${DeleteFile} "$INSTDIR\${FileMainEXE}"
  ${If} ${Errors}
    ; If the user closed the application it can take several seconds for it to
    ; shut down completely. If the application is being used by another user we
    ; can rename the file and then delete is when the system is restarted.
    Sleep 5000
    ${DeleteFile} "$INSTDIR\${FileMainEXE}"
    ClearErrors
  ${EndIf}

  ; setup the application model id registration value
  ${InitHashAppModelId} "$INSTDIR" "Software\Mozilla\${AppName}\TaskBarIDs"

  ${RemoveDeprecatedFiles}

  ${InstallStartCleanupCommon}
SectionEnd

Section "-Application" APP_IDX
  ${StartUninstallLog}

  SetDetailsPrint both
  DetailPrint $(STATUS_INSTALL_APP)
  SetDetailsPrint none

  ${LogHeader} "Installing Main Files"
  ${CopyFilesFromDir} "$EXEDIR\core" "$INSTDIR" \
                      "$(ERROR_CREATE_DIRECTORY_PREFIX)" \
                      "$(ERROR_CREATE_DIRECTORY_SUFFIX)"

  ; The MAPI DLL's are copied and the copies are then registered to lessen
  ; file in use errors on application update.
  ClearErrors
  ${DeleteFile} "$INSTDIR\MapiProxy_InUse.dll"
  ${If} ${Errors}
    ; Clear the way for the new file and delete the old file on reboot
    Rename "$INSTDIR\MapiProxy_InUse.dll" "$INSTDIR\MapiProxy_InUse.dll.moz-delete"
    Delete /REBOOTOK "$INSTDIR\MapiProxy_InUse.dll.moz-delete"
  ${EndIf}
  CopyFiles /SILENT "$EXEDIR\core\MapiProxy.dll" "$INSTDIR\MapiProxy_InUse.dll"
  ${LogMsg} "Installed File: $INSTDIR\MapiProxy_InUse.dll"
  ${LogUninstall} "File: \MapiProxy_InUse.dll"

  ClearErrors
  ${DeleteFile} "$INSTDIR\mozMapi32_InUse.dll"
  ${If} ${Errors}
    ; Clear the way for the new file and delete the old file on reboot
    Rename "$INSTDIR\mozMapi32_InUse.dll" "$INSTDIR\mozMapi32_InUse.dll.moz-delete"
    Delete /REBOOTOK "$INSTDIR\mozMapi32_InUse.dll.moz-delete"
  ${EndIf}
  CopyFiles /SILENT "$EXEDIR\core\mozMapi32.dll" "$INSTDIR\mozMapi32_InUse.dll"
  ${LogMsg} "Installed File: $INSTDIR\mozMapi32_InUse.dll"
  ${LogUninstall} "File: \mozMapi32_InUse.dll"

  ; Register DLLs
  ; XXXrstrong - AccessibleMarshal.dll can be used by multiple applications but
  ; is only registered for the last application installed. When the last
  ; application installed is uninstalled AccessibleMarshal.dll will no longer be
  ; registered. bug 338878
  ${LogHeader} "DLL Registration"

  ClearErrors

  ${RegisterDLL} "$INSTDIR\AccessibleMarshal.dll"
  ${If} ${Errors}
    ${LogMsg} "** ERROR Registering: $INSTDIR\AccessibleMarshal.dll **"
  ${Else}
    ${LogUninstall} "DLLReg: \AccessibleMarshal.dll"
    ${LogMsg} "Registered: $INSTDIR\AccessibleMarshal.dll"
  ${EndIf}

  ClearErrors

  ; Write extra files created by the application to the uninstall log so they
  ; will be removed when the application is uninstalled. To remove an empty
  ; directory write a bogus filename to the deepest directory and all empty
  ; parent directories will be removed.
  ${LogUninstall} "File: \components\compreg.dat"
  ${LogUninstall} "File: \components\xpti.dat"
  ${LogUninstall} "File: \active-update.xml"
  ${LogUninstall} "File: \install.log"
  ${LogUninstall} "File: \install_status.log"
  ${LogUninstall} "File: \install_wizard.log"
  ${LogUninstall} "File: \updates.xml"

  ; Default for creating Start Menu folder and shortcuts
  ; (1 = create, 0 = don't create)
  ${If} $AddStartMenuSC == ""
    StrCpy $AddStartMenuSC "1"
  ${EndIf}

; Default for creating Task Bar shortcuts
  ; (1 = create, 0 = don't create)
  ${If} $AddTaskbarSC == ""
    StrCpy $AddTaskbarSC "1"
  ${EndIf}

  ; Default for creating Quick Launch shortcut (1 = create, 0 = don't create)
  ${If} $AddQuickLaunchSC == ""
    StrCpy $AddQuickLaunchSC "1"
  ${EndIf}

  ; Default for creating Desktop shortcut (1 = create, 0 = don't create)
  ${If} $AddDesktopSC == ""
    StrCpy $AddDesktopSC "1"
  ${EndIf}

  ${LogHeader} "Adding Registry Entries"
  SetShellVarContext current  ; Set SHCTX to HKCU
  ${RegCleanMain} "Software\Mozilla"
  ${RegCleanUninstall}
  ${UpdateProtocolHandlers}

  ClearErrors
  WriteRegStr HKLM "Software\Mozilla" "${BrandShortName}InstallerTest" "Write Test"
  ${If} ${Errors}
    StrCpy $TmpVal "HKCU" ; used primarily for logging
  ${Else}
    SetShellVarContext all  ; Set SHCTX to HKLM
    DeleteRegValue HKLM "Software\Mozilla" "${BrandShortName}InstallerTest"
    StrCpy $TmpVal "HKLM" ; used primarily for logging
    ${RegCleanMain} "Software\Mozilla"
    ${RegCleanUninstall}
    ${UpdateProtocolHandlers}
  ${EndIf}

  ; The previous installer adds several registry values to both HKLM and HKCU.
  ; We now try to add to HKLM and if that fails to HKCU

  ; The order that reg keys and values are added is important if you use the
  ; uninstall log to remove them on uninstall. When using the uninstall log you
  ; MUST add children first so they will be removed first on uninstall so they
  ; will be empty when the key is deleted. This allows the uninstaller to
  ; specify that only empty keys will be deleted.
  ${SetAppKeys}

  ${FixClassKeys}

  StrCpy $1 "$\"$8$\" -requestPending -osint -url $\"%1$\""
  StrCpy $2 "$\"%1$\",,0,0,,,,"
  StrCpy $3 "$\"$8$\"  -url $\"%1$\""
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8

  ; An empty string is used for the 5th param because SeaMonkeyHTML is not a
  ; protocol handler
  ${AddHandlerValues} "SOFTWARE\Classes\SeaMonkeyHTML" "$3" \
                      "$INSTDIR\chrome\icons\default\html-file.ico,0" \
                      "${AppRegName} Document" "" ""
  ${AddDisabledDDEHandlerValues} "SeaMonkeyURL" "$1" "$8,0" \
                                 "${AppRegName} URL" ""

  ${FixShellIconHandler}

  ; The following keys should only be set if we can write to HKLM
  ${If} $TmpVal == "HKLM"
    ; Uninstall keys can only exist under HKLM on some versions of windows.
    ${SetUninstallKeys}

    ; Set the Start Menu Internet and Windows 7 Registered App HKLM registry keys.
    ${SetStartMenuInternet}
    ${SetClientsMail}

    ; If we are writing to HKLM and create the quick launch and the desktop
    ; shortcuts set IconsVisible to 1 otherwise to 0.
    ; Taskbar shortcuts imply having a start menu shortcut.
    ${StrFilter} "${FileMainEXE}" "+" "" "" $R9
    ${If} $AddQuickLaunchSC == 1
    ${OrIf} $AddDesktopSC == 1
    ${OrIf} $AddTaskbarSC == 1
      StrCpy $0 "Software\Clients\StartMenuInternet\$R9\InstallInfo"
      WriteRegDWORD HKLM "$0" "IconsVisible" 1
      StrCpy $0 "Software\Clients\Mail\${BrandFullNameInternal}\InstallInfo"
      WriteRegDWORD HKLM "$0" "IconsVisible" 1
    ${Else}
      StrCpy $0 "Software\Clients\StartMenuInternet\$R9\InstallInfo"
      WriteRegDWORD HKLM "$0" "IconsVisible" 0
      StrCpy $0 "Software\Clients\Mail\${BrandFullNameInternal}\InstallInfo"
      WriteRegDWORD HKLM "$0" "IconsVisible" 0
    ${EndIf}
  ${EndIf}

  ; These need special handling on uninstall since they may be overwritten by
  ; an install into a different location.
  StrCpy $0 "Software\Microsoft\Windows\CurrentVersion\App Paths\${FileMainEXE}"
  ${WriteRegStr2} $TmpVal "$0" "" "$INSTDIR\${FileMainEXE}" 0
  ${WriteRegStr2} $TmpVal "$0" "Path" "$INSTDIR" 0

  StrCpy $0 "Software\Microsoft\MediaPlayer\ShimInclusionList\$R9"
  ${CreateRegKey} "$TmpVal" "$0" 0
  StrCpy $0 "Software\Microsoft\MediaPlayer\ShimInclusionList\plugin-container.exe"
  ${CreateRegKey} "$TmpVal" "$0" 0

  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application

  ; Create shortcuts
  ${LogHeader} "Adding Shortcuts"

  ; Always add the relative path to the application's Start Menu directory and
  ; the application's shortcuts to the shortcuts log ini file. The
  ; DeleteShortcuts macro will do the right thing on uninstall if they don't
  ; exist.
  ${LogSMProgramsDirRelPath} "$StartMenuDir"
  ${LogSMProgramsShortcut} "${BrandFullName}.lnk"
  ${LogSMProgramsShortcut} "${BrandFullName} ($(SAFE_MODE)).lnk"
  ${LogSMProgramsShortcut} "${BrandFullNameInternal} $(MAILNEWS_TEXT).lnk"
  ${LogSMProgramsShortcut} "$(PROFILE_TEXT).lnk"
  ${LogQuickLaunchShortcut} "${BrandFullName}.lnk"
  ${LogDesktopShortcut} "${BrandFullName}.lnk"

  ${If} $AddStartMenuSC == 1
    ${Unless} ${FileExists} "$SMPROGRAMS\$StartMenuDir"
      CreateDirectory "$SMPROGRAMS\$StartMenuDir"
      ${LogMsg} "Added Start Menu Directory: $SMPROGRAMS\$StartMenuDir"
    ${EndUnless}
    CreateShortCut "$SMPROGRAMS\$StartMenuDir\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
    ${If} "$AppUserModelID" != ""
      ApplicationID::Set "$SMPROGRAMS\$StartMenuDir\${BrandFullName}.lnk" "$AppUserModelID"
    ${EndIf}
    ${LogMsg} "Added Shortcut: $SMPROGRAMS\$StartMenuDir\${BrandFullName}.lnk"
    CreateShortCut "$SMPROGRAMS\$StartMenuDir\${BrandFullName} ($(SAFE_MODE)).lnk" "$INSTDIR\${FileMainEXE}" "-safe-mode" "$INSTDIR\${FileMainEXE}" 0
    ${If} "$AppUserModelID" != ""
      ApplicationID::Set "$SMPROGRAMS\$StartMenuDir\${BrandFullName} ($(SAFE_MODE)).lnk" "$AppUserModelID"
    ${EndIf}
    ${LogMsg} "Added Shortcut: $SMPROGRAMS\$StartMenuDir\${BrandFullName} ($(SAFE_MODE)).lnk"
    CreateShortCut "$SMPROGRAMS\$StartMenuDir\${BrandFullName} $(MAILNEWS_TEXT).lnk" "$INSTDIR\${FileMainEXE}" "-mail" "$INSTDIR\chrome\icons\default\messengerWindow.ico" 0
    ${LogMsg} "Added Shortcut: $SMPROGRAMS\$StartMenuDir\${BrandFullName} $(MAILNEWS_TEXT).lnk"
    CreateShortCut "$SMPROGRAMS\$StartMenuDir\$(PROFILE_TEXT).lnk" "$INSTDIR\${FileMainEXE}" "-profileManager" "$INSTDIR\${FileMainEXE}" 0
    ${LogMsg} "Added Shortcut: $SMPROGRAMS\$StartMenuDir\$(PROFILE_TEXT).lnk"
  ${EndIf}

  ${If} $AddQuickLaunchSC == 1
    CreateShortCut "$QUICKLAUNCH\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
    ${If} "$AppUserModelID" != ""
      ApplicationID::Set "$QUICKLAUNCH\${BrandFullName}.lnk" "$AppUserModelID"
    ${EndIf}
    ${LogMsg} "Added Shortcut: $QUICKLAUNCH\${BrandFullName}.lnk"
  ${EndIf}

  ${If} $AddDesktopSC == 1
    CreateShortCut "$DESKTOP\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
    ${If} "$AppUserModelID" != ""
      ApplicationID::Set "$DESKTOP\${BrandFullName}.lnk" "$AppUserModelID"
    ${EndIf}
    ${LogMsg} "Added Shortcut: $DESKTOP\${BrandFullName}.lnk"
  ${EndIf}

  !insertmacro MUI_STARTMENU_WRITE_END
SectionEnd

; Cleanup operations to perform at the end of the installation.
Section "-InstallEndCleanup"
  SetDetailsPrint both
  DetailPrint "$(STATUS_CLEANUP)"
  SetDetailsPrint none

  ; Refresh desktop icons
  System::Call "shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)"

  ${InstallEndCleanupCommon}

  ; If we have to reboot give SHChangeNotify time to finish the refreshing
  ; the icons so the OS doesn't display the icons from helper.exe
  ${If} ${RebootFlag}
    Sleep 10000
    ${LogHeader} "Reboot Required To Finish Installation"
    ; ${FileMainEXE}.moz-upgrade should never exist but just in case...
    ${Unless} ${FileExists} "$INSTDIR\${FileMainEXE}.moz-upgrade"
      Rename "$INSTDIR\${FileMainEXE}" "$INSTDIR\${FileMainEXE}.moz-upgrade"
    ${EndUnless}

    ${If} ${FileExists} "$INSTDIR\${FileMainEXE}"
      ClearErrors
      Rename "$INSTDIR\${FileMainEXE}" "$INSTDIR\${FileMainEXE}.moz-delete"
      ${Unless} ${Errors}
        Delete /REBOOTOK "$INSTDIR\${FileMainEXE}.moz-delete"
      ${EndUnless}
    ${EndUnless}
    ${Unless} ${FileExists} "$INSTDIR\${FileMainEXE}"
      CopyFiles /SILENT "$INSTDIR\uninstall\helper.exe" "$INSTDIR"
      FileOpen $0 "$INSTDIR\${FileMainEXE}" w
      FileWrite $0 "Will be deleted on restart"
      Rename /REBOOTOK "$INSTDIR\${FileMainEXE}.moz-upgrade" "$INSTDIR\${FileMainEXE}"
      FileClose $0
      Delete "$INSTDIR\${FileMainEXE}"
      Rename "$INSTDIR\helper.exe" "$INSTDIR\${FileMainEXE}"
    ${EndUnless}
  ${EndIf}
SectionEnd

Function CheckExistingInstall
  ; If there is a pending file copy from a previous uninstall don't allow
  ; installing until after the system has rebooted.
  IfFileExists "$INSTDIR\${FileMainEXE}.moz-upgrade" +1 +4
  MessageBox MB_YESNO "$(WARN_RESTART_REQUIRED_UPGRADE)" IDNO +2
  Reboot
  Quit

  ; If there is a pending file deletion from a previous uninstall don't allow
  ; installing until after the system has rebooted.
  IfFileExists "$INSTDIR\${FileMainEXE}.moz-delete" +1 +4
  MessageBox MB_YESNO "$(WARN_RESTART_REQUIRED_UNINSTALL)" IDNO +2
  Reboot
  Quit

  ${If} ${FileExists} "$INSTDIR\${FileMainEXE}"
    Banner::show /NOUNLOAD "$(BANNER_CHECK_EXISTING)"
    ${If} "$TmpVal" == "FoundMessageWindow"
      Sleep 5000
    ${EndIf}
    ${PushFilesToCheck}
    ; Store the return value in $TmpVal so it is less likely to be accidentally
    ; overwritten elsewhere.
    ${CheckForFilesInUse} $TmpVal

    Banner::destroy

    ${If} "$TmpVal" == "true"
      StrCpy $TmpVal "FoundMessageWindow"
      ${ManualCloseAppPrompt} "${WindowClass}" "$(WARN_MANUALLY_CLOSE_APP_INSTALL)"
      StrCpy $TmpVal "true"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function LaunchApp
  GetFunctionAddress $0 LaunchAppFromElevatedProcess
  UAC::ExecCodeSegment $0
FunctionEnd

Function LaunchAppFromElevatedProcess
  ${ManualCloseAppPrompt} "${WindowClass}" "$(WARN_MANUALLY_CLOSE_APP_LAUNCH)"
  ; Find the installation directory when launching using GetFunctionAddress
  ; from an elevated installer since $INSTDIR will not be set in this installer
  ${StrFilter} "${FileMainEXE}" "+" "" "" $R9
  ReadRegStr $0 HKLM "Software\Clients\StartMenuInternet\$R9\DefaultIcon" ""
  ${GetPathFromString} "$0" $0
  ${GetParent} "$0" $1
  ; Set our current working directory to the application's install directory
  ; otherwise the 7-Zip temp directory will be in use and won't be deleted.
  SetOutPath "$1"
  Exec "$\"$0$\""
FunctionEnd

################################################################################
# Language

!insertmacro MOZ_MUI_LANGUAGE 'baseLocale'
!verbose push
!verbose 3
!include "overrideLocale.nsh"
!include "customLocale.nsh"
!verbose pop

; Set this after the locale files to override it if it is in the locale
; using " " for BrandingText will hide the "Nullsoft Install System..." branding
BrandingText " "

################################################################################
# Page pre and leave functions

Function preWelcome
  ${If} ${FileExists} "$EXEDIR\core\distribution\modern-wizard.bmp"
    Delete "$PLUGINSDIR\modern-wizard.bmp"
    CopyFiles /SILENT "$EXEDIR\core\distribution\modern-wizard.bmp" "$PLUGINSDIR\modern-wizard.bmp"
  ${EndIf}
FunctionEnd

Function showLicense
  ${If} ${FileExists} "$EXEDIR\core\distribution\modern-header.bmp"
  ${AndIf} $hHeaderBitmap == ""
    Delete "$PLUGINSDIR\modern-header.bmp"
    CopyFiles /SILENT "$EXEDIR\core\distribution\modern-header.bmp" "$PLUGINSDIR\modern-header.bmp"
    ${ChangeMUIHeaderImage} "$PLUGINSDIR\modern-header.bmp"
  ${EndIf}
FunctionEnd

Function preOptions
  !insertmacro MUI_HEADER_TEXT "$(OPTIONS_PAGE_TITLE)" "$(OPTIONS_PAGE_SUBTITLE)"
  !insertmacro MUI_INSTALLOPTIONS_DISPLAY "options.ini"
FunctionEnd

Function leaveOptions
  ${MUI_INSTALLOPTIONS_READ} $0 "options.ini" "Settings" "State"
  ${If} $0 != 0
    Abort
  ${EndIf}
  ${MUI_INSTALLOPTIONS_READ} $R0 "options.ini" "Field 2" "State"
  StrCmp $R0 "1" +1 +2
  StrCpy $InstallType ${INSTALLTYPE_BASIC}
  ${MUI_INSTALLOPTIONS_READ} $R0 "options.ini" "Field 3" "State"
  StrCmp $R0 "1" +1 +2
  StrCpy $InstallType ${INSTALLTYPE_CUSTOM}

  ${LeaveOptionsCommon}

  ${If} $InstallType == ${INSTALLTYPE_BASIC}
    Call CheckExistingInstall
  ${EndIf}
FunctionEnd

Function preDirectory
  ${PreDirectoryCommon}
FunctionEnd

Function leaveDirectory
  ${If} $InstallType == ${INSTALLTYPE_BASIC}
    Call CheckExistingInstall
  ${EndIf}
  ${LeaveDirectoryCommon} "$(WARN_DISK_SPACE)" "$(WARN_WRITE_ACCESS)"
FunctionEnd

Function preShortcuts
  ${CheckCustomCommon}
  !insertmacro MUI_HEADER_TEXT "$(SHORTCUTS_PAGE_TITLE)" "$(SHORTCUTS_PAGE_SUBTITLE)"
  !insertmacro MUI_INSTALLOPTIONS_DISPLAY "shortcuts.ini"
FunctionEnd

Function leaveShortcuts
  ${MUI_INSTALLOPTIONS_READ} $0 "shortcuts.ini" "Settings" "State"
  ${If} $0 != 0
    Abort
  ${EndIf}
  ${MUI_INSTALLOPTIONS_READ} $AddDesktopSC "shortcuts.ini" "Field 2" "State"
  ${MUI_INSTALLOPTIONS_READ} $AddStartMenuSC "shortcuts.ini" "Field 3" "State"
  ${MUI_INSTALLOPTIONS_READ} $AddQuickLaunchSC "shortcuts.ini" "Field 4" "State"

  ; If Start Menu shortcuts won't be created call CheckExistingInstall here
  ; since leaveStartMenu will not be called.
  ${If} $AddStartMenuSC != 1
  ${AndIf} $InstallType == ${INSTALLTYPE_CUSTOM}
    Call CheckExistingInstall
  ${EndIf}
FunctionEnd

Function preStartMenu
  ; With the Unicode installer the path to the application's Start Menu
  ; directory relative to the Start Menu's Programs directory is written to the
  ; shortcuts log ini file and is used to set the default Start Menu directory.
  ${GetSMProgramsDirRelPath} $0
  ${If} "$0" != ""
    StrCpy $StartMenuDir "$0"
  ${Else}
    ; Prior to the Unicode installer the path to the application's Start Menu
    ; directory relative to the Start Menu's Programs directory was written to
    ; the registry and use this value to set the default Start Menu directory.
    ClearErrors
    ReadRegStr $0 HKLM "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Main" "Start Menu Folder"
    ${If} ${Errors}
      ; Use the FindSMProgramsDir macro to find a previously used path to the
      ; application's Start Menu directory relative to the Start Menu's Programs
      ; directory in the uninstall log and use this value to set the default
      ; Start Menu directory.
      ${FindSMProgramsDir} $0
      ${If} "$0" != ""
        StrCpy $StartMenuDir "$0"
      ${EndIf}
    ${Else}
      StrCpy $StartMenuDir "$0"
    ${EndUnless}
  ${EndIf}

  ${CheckCustomCommon}
  ${If} $AddStartMenuSC != 1
    Abort
  ${EndIf}
FunctionEnd

Function leaveStartMenu
  ${If} $InstallType == ${INSTALLTYPE_CUSTOM}
    Call CheckExistingInstall
  ${EndIf}
FunctionEnd

Function preSummary
  WriteINIStr "$PLUGINSDIR\summary.ini" "Settings" NumFields "3"

  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Type   "label"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Text   "$(SUMMARY_INSTALLED_TO)"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Left   "0"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Right  "-1"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Top    "5"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 1" Bottom "15"

  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" Type   "text"
  ; The contents of this control must be set as follows in the pre function
  ; ${MUI_INSTALLOPTIONS_READ} $1 "summary.ini" "Field 2" "HWND"
  ; SendMessage $1 ${WM_SETTEXT} 0 "STR:$INSTDIR"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" state  ""
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" Left   "0"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" Right  "-1"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" Top    "17"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" Bottom "30"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 2" flags  "READONLY"

  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Type   "label"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Text   "$(SUMMARY_CLICK)"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Left   "0"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Right  "-1"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Top    "130"
  WriteINIStr "$PLUGINSDIR\summary.ini" "Field 3" Bottom "150"

  ${If} "$TmpVal" == "true"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Type   "label"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Text   "$(SUMMARY_REBOOT_REQUIRED_INSTALL)"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Left   "0"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Right  "-1"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Top    "35"
    WriteINIStr "$PLUGINSDIR\summary.ini" "Field 4" Bottom "45"

    WriteINIStr "$PLUGINSDIR\summary.ini" "Settings" NumFields "4"
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "$(SUMMARY_PAGE_TITLE)" "$(SUMMARY_PAGE_SUBTITLE)"

  ; The Summary custom page has a textbox that will automatically receive
  ; focus. This sets the focus to the Install button instead.
  !insertmacro MUI_INSTALLOPTIONS_INITDIALOG "summary.ini"
  GetDlgItem $0 $HWNDPARENT 1
  System::Call "user32::SetFocus(i r0, i 0x0007, i,i)i"
  ${MUI_INSTALLOPTIONS_READ} $1 "summary.ini" "Field 2" "HWND"
  SendMessage $1 ${WM_SETTEXT} 0 "STR:$INSTDIR"
  !insertmacro MUI_INSTALLOPTIONS_SHOW
FunctionEnd

Function leaveSummary
  ; Try to delete the app executable and if we can't delete it try to find the
  ; app's message window and prompt the user to close the app. This allows
  ; running an instance that is located in another directory. If for whatever
  ; reason there is no message window we will just rename the app's files and
  ; then remove them on restart.
  ClearErrors
  ${DeleteFile} "$INSTDIR\${FileMainEXE}"
  ${If} ${Errors}
    ${ManualCloseAppPrompt} "${WindowClass}" "$(WARN_MANUALLY_CLOSE_APP_INSTALL)"
  ${EndIf}
FunctionEnd

; When we add an optional action to the finish page the cancel button is
; enabled. This disables it and leaves the finish button as the only choice.
Function preFinish
  ${EndInstallLog} "${BrandFullName}"
  !insertmacro MUI_INSTALLOPTIONS_WRITE "ioSpecial.ini" "settings" "cancelenabled" "0"
FunctionEnd

################################################################################
# Initialization Functions

Function .onInit
  StrCpy $LANGUAGE 0
  ${SetBrandNameVars} "$EXEDIR\core\distribution\setup.ini"

  ; Don't install on systems that don't support SSE2. The parameter value of
  ; 10 is for PF_XMMI64_INSTRUCTIONS_AVAILABLE which will check whether the
  ; SSE2 instruction set is available. Result returned in $R7.
  System::Call "kernel32::IsProcessorFeaturePresent(i 10)i .R7"

  ; Windows NT 6.0 (Vista/Server 2008) and lower are not supported.
  ${Unless} ${AtLeastWin7}
    ${If} "$R7" == "0"
      strCpy $R7 "$(WARN_MIN_SUPPORTED_OSVER_CPU_MSG)"
    ${Else}
      strCpy $R7 "$(WARN_MIN_SUPPORTED_OSVER_MSG)"
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONSTOP "$R7" IDCANCEL +2
    ExecShell "open" "${URLSystemRequirements}"
    Quit
  ${EndUnless}

  ; SSE2 CPU support
  ${If} "$R7" == "0"
    MessageBox MB_OKCANCEL|MB_ICONSTOP "$(WARN_MIN_SUPPORTED_CPU_MSG)" IDCANCEL +2
    ExecShell "open" "${URLSystemRequirements}"
    Quit
  ${EndIf}

!ifdef HAVE_64BIT_BUILD
  ${Unless} ${RunningX64}
    MessageBox MB_OKCANCEL|MB_ICONSTOP "$(WARN_MIN_SUPPORTED_OSVER_MSG)" IDCANCEL +2
    ExecShell "open" "${URLSystemRequirements}"
    Quit
  ${EndUnless}
  SetRegView 64
!endif

  ${InstallOnInitCommon} "$(WARN_MIN_SUPPORTED_OSVER_CPU_MSG)"


  !insertmacro InitInstallOptionsFile "options.ini"
  !insertmacro InitInstallOptionsFile "shortcuts.ini"
  !insertmacro InitInstallOptionsFile "summary.ini"

  ; Setup the options.ini file for the Custom Options Page
  WriteINIStr "$PLUGINSDIR\options.ini" "Settings" NumFields "5"

  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Type   "label"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Text   "$(OPTIONS_SUMMARY)"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Left   "0"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Right  "-1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Top    "0"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 1" Bottom "10"

  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Type   "RadioButton"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Text   "$(OPTION_STANDARD_RADIO)"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Left   "15"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Right  "-1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Top    "25"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Bottom "35"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" State  "1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 2" Flags  "GROUP"

  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Type   "RadioButton"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Text   "$(OPTION_CUSTOM_RADIO)"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Left   "15"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Right  "-1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Top    "55"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" Bottom "65"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 3" State  "0"

  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Type   "label"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Text   "$(OPTION_STANDARD_DESC)"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Left   "30"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Right  "-1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Top    "37"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 4" Bottom "57"

  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Type   "label"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Text   "$(OPTION_CUSTOM_DESC)"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Left   "30"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Right  "-1"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Top    "67"
  WriteINIStr "$PLUGINSDIR\options.ini" "Field 5" Bottom "87"

  ; Setup the shortcuts.ini file for the Custom Shortcuts Page
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Settings" NumFields "4"

  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Type   "label"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Text   "$(CREATE_ICONS_DESC)"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Left   "0"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Right  "-1"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Top    "5"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 1" Bottom "15"

  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Type   "checkbox"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Text   "$(ICONS_DESKTOP)"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Left   "15"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Right  "-1"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Top    "20"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Bottom "30"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" State  "1"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 2" Flags  "GROUP"

  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Type   "checkbox"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Text   "$(ICONS_STARTMENU)"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Left   "15"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Right  "-1"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Top    "40"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" Bottom "50"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 3" State  "1"

  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Type   "checkbox"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Text   "$(ICONS_QUICKLAUNCH)"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Left   "15"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Right  "-1"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Top    "60"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" Bottom "70"
  WriteINIStr "$PLUGINSDIR\shortcuts.ini" "Field 4" State  "1"

  ; There must always be a core directory
  ${GetSize} "$EXEDIR\core\" "/S=0K" $R5 $R7 $R8
  ; Add 1024 Kb to the diskspace requirement since the installer makes a copy
  ; of the MAPI dll's (around 20 Kb)... also, see Bug 434338.
  IntOp $R5 $R5 + 1024
  SectionSetSize ${APP_IDX} $R5

  ; Initialize $hHeaderBitmap to prevent redundant changing of the bitmap if
  ; the user clicks the back button
  StrCpy $hHeaderBitmap ""
FunctionEnd

Function .onGUIEnd
  ${OnEndCommon}
FunctionEnd
