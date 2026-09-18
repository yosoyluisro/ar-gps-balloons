param(
    [switch]$Tunnel
)

$ErrorActionPreference = 'Stop'
$port = 8080
$dir = $PSScriptRoot

Write-Host ""
Write-Host "==  AR GPS Balloons - Servidor  ==" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "No se encontro 'python'. Se usara npx http-server (requiere Node)." -ForegroundColor Yellow
}

$serverJob = Start-Job -ScriptBlock {
    param($p, $d)
    if (Get-Command python -ErrorAction SilentlyContinue) {
        python -m http.server $p --directory $d
    } else {
        npx --yes http-server $d -p $p
    }
} -ArgumentList $port, $dir

Start-Sleep -Seconds 2

if ($Tunnel) {
    Write-Host "[1/2] Sirviendo en http://localhost:$port" -ForegroundColor Yellow
    Write-Host "[2/2] Abriendo tunel publico de Cloudflare..." -ForegroundColor Yellow
    Write-Host "     Copia la URL https://xxx.trycloudflare.com y abrela en tu celular." -ForegroundColor Green
    Write-Host ""
    npx --yes cloudflared tunnel --url "http://localhost:$port"
}
else {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254)' } |
        Select-Object -First 1).IPAddress

    Write-Host "[1/2] Sirviendo en http://localhost:$port" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "URL en tu red local (celular con PC en el mismo WiFi):" -ForegroundColor Green
    Write-Host "   http://$ip`:$port" -ForegroundColor White
    Write-Host ""
    Write-Host "OJO: la app usa WebXR y REQUIERE HTTPS. Para verla en el celular usa:" -ForegroundColor Yellow
    Write-Host "   .\servir.ps1 -Tunnel" -ForegroundColor White
    Write-Host ""
    Write-Host "Presiona Ctrl+C para detener." -ForegroundColor DarkGray
    Wait-Event | Out-Null
}

Stop-Job $serverJob -ErrorAction SilentlyContinue | Out-Null
Remove-Job $serverJob -ErrorAction SilentlyContinue | Out-Null