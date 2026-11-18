# Genera installer\output\FaceEdit_Python.zip: instalación basada en Python (sin .exe propio),
# útil en equipos con Smart App Control, que bloquea ejecutables sin firma.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP "FaceEdit_Python_stage"
$pkg = Join-Path $stage "FaceEdit"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $pkg | Out-Null

foreach ($f in "app.py", "run_app.py", "requirements.txt") { Copy-Item (Join-Path $root $f) $pkg }
foreach ($d in "facial", "templates", "static") {
    Copy-Item (Join-Path $root $d) $pkg -Recurse
}
Get-ChildItem $pkg -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot "python\*.bat") $pkg

# Pesos de emoción de DeepFace (así no hace falta descargarlos en la otra PC).
$w = Join-Path $env:USERPROFILE ".deepface\weights\facial_expression_model_weights.onnx"
if (Test-Path $w) {
    $dest = Join-Path $pkg "deepface_home\.deepface\weights"
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item $w $dest
}

# Nunca incluir configuración ni credenciales.
Get-ChildItem $pkg -Recurse -Filter config.ini | Remove-Item -Force

$out = Join-Path $PSScriptRoot "output"
New-Item -ItemType Directory -Force $out | Out-Null
$zip = Join-Path $out "FaceEdit_Python.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $pkg -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -Recurse -Force $stage
"{0}  ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB)
