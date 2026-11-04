<#
  Desinstala o Painel de Silos do Windows: remove o serviço, a regra de firewall e o atalho.
  Os dados (histórico, usuários, backups), o .env e os arquivos do programa são MANTIDOS,
  a menos que se use -ApagarDados.

  Mais fácil: dois cliques em "desinstalar.bat".
#>
[CmdletBinding()]
param([switch]$ApagarDados)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"")
  if ($ApagarDados) { $argumentos += '-ApagarDados' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentos
  exit 0
}

Write-Host "`n  Desinstalar o Painel de Silos ($PSScriptRoot)" -ForegroundColor Yellow
$r = Read-Host '  Confirma? [s/N]'
if (-not $r.Trim().ToLower().StartsWith('s')) { Write-Host '  Cancelado.'; exit 0 }

if (Get-Service | Where-Object { $_.DisplayName -eq 'Painel de Silos' }) {
  & npm.cmd run servico --silent -- remover
  Write-Host '  OK  Serviço removido' -ForegroundColor Green
} else {
  Write-Host '  -   Serviço não estava instalado' -ForegroundColor Gray
}

Get-NetFirewallRule -DisplayName 'Painel de Silos' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host '  OK  Regra de firewall removida' -ForegroundColor Green

$atalho = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Painel de Silos.url'
Remove-Item $atalho -ErrorAction SilentlyContinue
Write-Host '  OK  Atalho removido' -ForegroundColor Green

if ($ApagarDados) {
  $r = Read-Host '  APAGAR histórico, usuários, backups e o .env? Isso não pode ser desfeito. Digite APAGAR'
  if ($r -ceq 'APAGAR') {
    Remove-Item -Recurse -Force data, logs, .env -ErrorAction SilentlyContinue
    Write-Host '  OK  Dados apagados' -ForegroundColor Green
  } else {
    Write-Host '  -   Dados mantidos' -ForegroundColor Gray
  }
} else {
  Write-Host "`n  Os dados continuam em $PSScriptRoot\data (histórico, usuários, backups)." -ForegroundColor Gray
  Write-Host '  Para reinstalar depois, basta rodar instalar.bat de novo.' -ForegroundColor Gray
}
