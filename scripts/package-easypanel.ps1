$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspaceRoot = Split-Path $projectRoot -Parent
$archivePath = Join-Path $workspaceRoot ('wis-whatsapp-easypanel-upload-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
$tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
$stagePath = Join-Path $tempRoot ('wis-easypanel-stage-' + [guid]::NewGuid().ToString('N'))
$excludedSegments = @('.git', '.local', 'node_modules', '.next', 'out', 'dist', 'build', 'coverage', 'backups', 'auth', '.wwebjs_auth')

New-Item -ItemType Directory -Path $stagePath | Out-Null
try {
    $files = Get-ChildItem -LiteralPath $projectRoot -Force -Recurse -File | Where-Object {
        $relative = $_.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
        $segments = $relative -split '[\\/]'
        $blockedPath = @($segments | Where-Object { $excludedSegments -contains $_ }).Count -gt 0
        $name = $_.Name
        $blockedFile = $name -eq '.env' -or (($name.StartsWith('.env.')) -and $name -ne '.env.example') -or
            $name -match '[.](sqlite(-wal|-shm)?|db|pem)$' -or
            $name -in @('admin-access.txt', 'runtime.lock', 'runtime.json')
        -not $blockedPath -and -not $blockedFile
    }

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
        $destination = Join-Path $stagePath $relative
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination
    }

    if (-not (Test-Path -LiteralPath (Join-Path $stagePath 'Dockerfile'))) {
        throw 'Dockerfile missing from deployment source.'
    }
    Compress-Archive -Path (Join-Path $stagePath '*') -DestinationPath $archivePath -CompressionLevel Optimal -Force

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $entries = @($zip.Entries | ForEach-Object FullName)
        $unsafe = @($entries | Where-Object {
            $_ -match '(^|/)([.]git|[.]local|node_modules|auth|[.]wwebjs_auth)(/|$)' -or
            (($_ -match '(^|/)[.]env($|[.])') -and ($_ -notmatch '(^|/)[.]env[.]example$')) -or $_ -match '[.](sqlite(-wal|-shm)?|db|pem)$' -or
            $_ -match '(^|/)(admin-access[.]txt|runtime[.](json|lock))$'
        })
        if ($unsafe.Count -gt 0) { throw ('Private paths found in package: ' + ($unsafe -join ', ')) }
    }
    finally {
        $zip.Dispose()
    }

    $size = (Get-Item -LiteralPath $archivePath).Length
    Write-Output "Package: $archivePath"
    Write-Output "Files: $($entries.Count); bytes: $size; private-path check: passed"
}
finally {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
    $resolvedStage = [System.IO.Path]::GetFullPath($stagePath)
    if ($resolvedStage.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and $resolvedStage -match '^.+\\wis-easypanel-stage-[0-9a-f]{32}$') {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
