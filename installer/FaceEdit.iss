; Instalador de FaceEdit (Inno Setup 6).
; Compilar:  ISCC.exe installer\FaceEdit.iss   (antes: PyInstaller -> dist\FaceEdit)

#define AppName "FaceEdit"
#define AppVersion "1.0.0"
#define AppExe "FaceEdit.exe"

[Setup]
AppId={{6D1B0C5E-3F0A-4B8E-9C47-1A2B3C4D5E6F}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=FaceEdit_Setup
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExe}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\dist\FaceEdit\*"; DestDir: "{app}"; Excludes: "config.ini"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Iniciar {#AppName} ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\config.ini"
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{localappdata}\FaceEdit"

[Code]
var
  CamPage: TInputQueryWizardPage;
  HintLabel: TNewStaticText;

procedure InitializeWizard;
begin
  CamPage := CreateInputQueryPage(wpSelectDir,
    'Configuración de la cámara Tapo',
    'Datos de conexión de la cámara',
    'Escribe los datos de tu cámara TP-Link Tapo. Si solo usarás la cámara web ' +
    'del equipo o subirás fotos, deja los campos vacíos y pulsa Siguiente.');

  CamPage.Add('Dirección IP de la cámara (ejemplo: 192.168.1.50):', False);
  CamPage.Add('Usuario de la cuenta de cámara:', False);
  CamPage.Add('Contraseña de la cuenta de cámara:', True);

  // Permite instalaciones desatendidas: FaceEdit_Setup.exe /SILENT /IP=... /USER=... /PASS=...
  CamPage.Values[0] := ExpandConstant('{param:IP|}');
  CamPage.Values[1] := ExpandConstant('{param:USER|}');
  CamPage.Values[2] := ExpandConstant('{param:PASS|}');

  HintLabel := TNewStaticText.Create(CamPage);
  HintLabel.Parent := CamPage.Surface;
  HintLabel.AutoSize := False;
  HintLabel.WordWrap := True;
  HintLabel.Left := 0;
  HintLabel.Width := CamPage.SurfaceWidth;
  HintLabel.Top := CamPage.Edits[2].Top + CamPage.Edits[2].Height + ScaleY(18);
  HintLabel.Height := ScaleY(110);
  HintLabel.Caption :=
    'Dónde encontrar los datos en la app Tapo:' + #13#10 +
    '  • IP: Configuración del dispositivo > Acerca de > Dirección IP.' + #13#10 +
    '  • Usuario y contraseña: Configuración > Avanzado > Cuenta de cámara ' +
    '(no son los de tu cuenta TP-Link).' + #13#10 +
    'El equipo y la cámara deben estar en la misma red WiFi. ' +
    'Los datos se guardan solo en este equipo, en config.ini.';
end;

function IsLikelyIp(const S: String): Boolean;
var
  I, Dots: Integer;
begin
  Result := Length(S) >= 7;
  Dots := 0;
  for I := 1 to Length(S) do
  begin
    if S[I] = '.' then
      Dots := Dots + 1
    else if (S[I] < '0') or (S[I] > '9') then
      Result := False;
  end;
  if Dots <> 3 then
    Result := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Ip, User, Pass: String;
begin
  Result := True;
  if CurPageID = CamPage.ID then
  begin
    Ip := Trim(CamPage.Values[0]);
    User := Trim(CamPage.Values[1]);
    Pass := CamPage.Values[2];

    // Todo vacío = no configurar la Tapo (se podrá hacer después).
    if (Ip = '') and (User = '') and (Pass = '') then
      Exit;

    if not IsLikelyIp(Ip) then
    begin
      MsgBox('La dirección IP no es válida. Debe verse como 192.168.1.50.', mbError, MB_OK);
      Result := False;
    end
    else if (User = '') or (Pass = '') then
    begin
      MsgBox('Escribe el usuario y la contraseña de la cuenta de cámara.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure WriteConfig;
var
  Lines: TArrayOfString;
begin
  if Trim(CamPage.Values[0]) = '' then
    Exit;

  SetArrayLength(Lines, 6);
  Lines[0] := '[tapo]';
  Lines[1] := 'ip = ' + Trim(CamPage.Values[0]);
  Lines[2] := 'user = ' + Trim(CamPage.Values[1]);
  Lines[3] := 'password = ' + CamPage.Values[2];
  Lines[4] := 'stream = stream1';
  Lines[5] := '';
  SaveStringsToUTF8File(ExpandConstant('{app}\config.ini'), Lines, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteConfig;
end;
