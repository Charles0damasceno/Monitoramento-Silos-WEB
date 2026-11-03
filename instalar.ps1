<#
  Instalador do Painel de Silos (Windows).
  Execute em um PowerShell "Executar como administrador", na pasta do projeto:
      powershell -ExecutionPolicy Bypass -File .\instalar.ps1

  Etapas: confere o Node, instala dependências, compila o site, cria o .env,
  cria o primeiro usuário, libera a porta no firewall e instala o serviço do Windows.
#>
[CmdletBinding()]
param(
  [switch]$SemServico,   # só prepara, sem instalar o serviço
  [switch]$SemFirewall   # não mexe no firewall
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Etapa($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin -and -not $SemServico) {
  Falha 'Abra o PowerShell como administrador (ou use -SemServico para só preparar).'
}

Etapa 'Conferindo o Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Falha 'Node.js não encontrado. Instale a versão LTS 22 ou mais nova: https://nodejs.org/' }
$versao = [version]((node -v).TrimStart('v'))
if ($versao -lt [version]'22.13.0') { Falha "Node.js $versao é antigo. É preciso 22.13 ou mais novo." }
Write-Host "Node.js $versao OK"

Etapa 'Instalando dependências'
npm ci --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Falha 'npm ci falhou.' }

Etapa 'Compilando o site'
npm run build
if ($LASTEXITCODE -ne 0) { Falha 'build falhou.' }

Etapa 'Configuração (.env)'
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Criado .env a partir do .env.example. Preencha DB_USER e DB_PASSWORD e rode o instalador de novo.' -ForegroundColor Yellow
  notepad .env
  exit 0
}
Write-Host '.env encontrado.'

Etapa 'Testes automáticos'
npm test
if ($LASTEXITCODE -ne 0) { Falha 'Os testes falharam; a instalação foi interrompida.' }

Etapa 'Usuários'
$usuarios = Join-Path $PSScriptRoot 'data\usuarios.json'
if (-not (Test-Path $usuarios)) {
  $nome = Read-Host 'Nenhum usuário cadastrado. Nome do usuário administrador (ex.: admin)'
  npm run usuario -- adicionar $nome --admin
  if ($LASTEXITCODE -ne 0) { Falha 'não foi possível criar o usuário.' }
} else {
  Write-Host 'Usuários já cadastrados (gerencie com: npm run usuario -- listar).'
}

$porta = ((Get-Content .env | Where-Object { $_ -match '^\s*PORT\s*=' }) -replace '.*=\s*', '').Trim()
if (-not $porta) { $porta = '12322' }

if (-not $SemFirewall -and $admin) {
  Etapa "Liberando a porta $porta no firewall (rede privada/domínio)"
  $regra = 'Painel de Silos'
  Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $regra -Direction Inbound -Protocol TCP -LocalPort $porta `
    -Action Allow -Profile Domain,Private | Out-Null
  Write-Host 'Regra criada.'
}

if (-not $SemServico) {
  Etapa 'Instalando o serviço do Windows'
  npm run servico -- instalar
  Start-Sleep -Seconds 6
  try {
    $saude = Invoke-RestMethod "http://127.0.0.1:$porta/api/saude" -TimeoutSec 10
    Write-Host "Servidor respondendo (comunicação com o banco: $($saude.comunicacao))." -ForegroundColor Green
  } catch {
    Write-Host 'O serviço foi instalado, mas ainda não respondeu. Veja a pasta logs\.' -ForegroundColor Yellow
  }
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp','Manual' } | Select-Object -First 1).IPAddress
Write-Host "`nPronto! Acesse: http://localhost:$porta  (na rede: http://${ip}:$porta)" -ForegroundColor Green
