# Refresh Anvay's USD/INR rate on Monad testnet by running the Chainlink CRE workflow with a real on-chain write.
# Scheduled every 5 hours by Windows Task Scheduler ("Anvay Chainlink rate refresh"). Log: cre\logs\refresh-rate.log
#
# Needs: CRE CLI logged in (`cre login`), Bun, and cre\.env with a funded CRE_ETH_PRIVATE_KEY.

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$log = Join-Path $root "logs\refresh-rate.log"
$cre = "E:\.cre\cre.exe"
$cast = "E:\.foundry\bin\cast.exe"
$feed = "0x12cC9B5656F7593C2FeF04964D35752d7e3dc60F"
$rpc = "https://testnet-rpc.monad.xyz"

New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
function Log($message) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" | Out-File -FilePath $log -Append -Encoding utf8
}

$env:BUN_INSTALL = "E:\.bun"
$env:PATH = "E:\.bun\bin;$env:PATH"
Set-Location $root

$before = (& $cast call $feed "latest()(uint256,uint64,uint64)" --rpc-url $rpc 2>$null) -join " "
$output = & $cre workflow simulate inr-rate --target staging-settings --broadcast --non-interactive --trigger-index 0 -e .env 2>&1 | Out-String
$after = (& $cast call $feed "latest()(uint256,uint64,uint64)" --rpc-url $rpc 2>$null) -join " "

$rateLine = ($output -split "`n" | Where-Object { $_ -match "consensus rate" } | Select-Object -Last 1)
if ($after -and $after -ne $before) {
    Log "OK   $($rateLine.Trim())  feed now: $after"
} else {
    $tail = ($output -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 6) -join " | "
    Log "FAIL feed unchanged ($after). CRE output: $tail"
}

# Keep the log short.
$lines = Get-Content $log -ErrorAction SilentlyContinue
if ($lines.Count -gt 300) { $lines | Select-Object -Last 300 | Set-Content $log -Encoding utf8 }
