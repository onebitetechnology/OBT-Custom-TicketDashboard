!ifdef BUILD_UNINSTALLER
  !include "LogicLib.nsh"
  !include "nsDialogs.nsh"

  Var RemovePersonalDataCheckbox
  Var RemovePersonalDataState

  !macro customUninstallPage
    UninstPage custom un.RemovePersonalDataPageCreate un.RemovePersonalDataPageLeave
  !macroend

  Function un.RemovePersonalDataPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Choose whether to also remove saved settings, tokens, API keys, and cache files from this computer."
    Pop $0

    ${NSD_CreateCheckbox} 0 34u 100% 12u "Remove all personal data/files"
    Pop $RemovePersonalDataCheckbox

    nsDialogs::Show
  FunctionEnd

  Function un.RemovePersonalDataPageLeave
    ${NSD_GetState} $RemovePersonalDataCheckbox $RemovePersonalDataState
  FunctionEnd

  !macro customUnInstall
    ${If} $RemovePersonalDataState = ${BST_CHECKED}
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    ${EndIf}
  !macroend
!endif
