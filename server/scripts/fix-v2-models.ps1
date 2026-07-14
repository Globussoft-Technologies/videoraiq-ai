
# For all v2 model files, replace the entire file with a re-export from v1.
# This is the cleanest solution - avoids all OverwriteModelError issues.
#
# NOTE: [System.IO.Path]::GetRelativePath does NOT exist in Windows PowerShell
# 5.1 (.NET Framework). Using it silently returned $null and wrote broken
# `from ""` imports. The relative path is computed manually instead: every v2
# model at core\v2\<module>\<file> maps to ../../v1/<module>/<file>.

$v2Root = Join-Path (Split-Path $PSScriptRoot -Parent) "core\v2"
$v2ModelFiles = Get-ChildItem -Path $v2Root -Recurse -Filter "*.model.js"

foreach ($file in $v2ModelFiles) {
    # Path of the model relative to core\v2, e.g. "roles\roles.model.js"
    $rel = $file.FullName.Substring($v2Root.Length).TrimStart('\')
    $relUnix = $rel -replace '\\', '/'

    $v1Path = Join-Path (Split-Path $v2Root -Parent) ("v1\" + $rel)
    if (-not (Test-Path $v1Path)) {
        Write-Host "No v1 match for: $($file.FullName)"
        continue
    }

    # From core\v2\<module>\ the v1 twin is ../../v1/<module>/<file>
    $importPath = "../../v1/$relUnix"

    # Only re-export `default` when the v1 source actually has one. Some models
    # (e.g. detectionSettings, incidents) export named discriminators only — a
    # blanket `export { default }` on those throws "does not provide an export
    # named 'default'" at import time.
    $hasDefault = Select-String -Path $v1Path -Pattern '^\s*export default' -Quiet

    if ($hasDefault) {
        $newContent = "// v2: re-exports from v1 - same model, no duplication`r`n" +
                      "export * from `"$importPath`";`r`n" +
                      "export { default } from `"$importPath`";`r`n"
    } else {
        $newContent = "// v2: re-exports from v1 - same model (named exports only), no duplication`r`n" +
                      "export * from `"$importPath`";`r`n"
    }

    [System.IO.File]::WriteAllText($file.FullName, $newContent, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Re-exported: $($file.Name) -> $importPath"
}
Write-Host "Done."
