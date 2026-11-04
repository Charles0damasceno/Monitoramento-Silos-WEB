<#
  Instalador do Painel de Silos para Windows (10/11 e Windows Server 2016+).

  Mais fácil: dê dois cliques em "instalar.bat" (ele pede permissão de administrador).
  Ou, no PowerShell:  powershell -ExecutionPolicy Bypass -File .\instalar.ps1

  O que ele faz:
    1. Confere o Node.js 22 (oferece instalar pelo winget se faltar)
    2. Instala as dependências (e compila o site, se ainda não vier compilado)
    3. Pergunta os dados do banco da IHM e grava o .env (só na primeira vez)
    4. Roda o diagnóstico (conexão, tabela, colunas, permissões)
    5. Cria o primeiro usuário administrador
    6. Libera a porta no firewall (redes privada/domínio)
    7. Instala o serviço "Painel de Silos" (inicia com o Windows, reinicia se cair)
    8. Cria o atalho "Painel de Silos" na área de trabalho

  Rodar de novo atualiza a instalação sem apagar dados, usuários ou configuração.

  Parâmetros:
    -SemServico      só prepara (não instala serviço nem mexe no firewall); não exige administrador
    -SemFirewall     não cria a regra de firewall
    -NaoInterativo   não pergunta nada: usa o .env existente ou as variáveis CFG_* (ver README)
#>
[CmdletBinding()]
param(
  [switch]$SemServico,
  [switch]$SemFirewall,
  [switch]$NaoInterativo
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$NODE_MINIMO = [version]'22.13.0'

function Etapa($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "    OK  $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "    !   $texto" -ForegroundColor Yellow }
function Falha($texto) {
  Write-Host "`nERRO: $texto" -ForegroundColor Red
  if (-not $NaoInterativo) { Read-Host 'Pressione Enter para sair' | Out-Null }
  exit 1
}
function Perguntar($texto, $padrao) {
  if ($NaoInterativo) { return $padrao }
  $sufixo = if ($padrao) { " [$padrao]" } else { '' }
  $r = Read-Host "$texto$sufixo"
  if ([string]::IsNullOrWhiteSpace($r)) { return $padrao } else { return $r.Trim() }
}
function Confirmar($texto, $padraoSim = $true) {
  if ($NaoInterativo) { return $padraoSim }
  $op = if ($padraoSim) { '[S/n]' } else { '[s/N]' }
  $r = Read-Host "$texto $op"
  if ([string]::IsNullOrWhiteSpace($r)) { return $padraoSim }
  return $r.Trim().ToLower().StartsWith('s')
}
function Npm { & npm.cmd @args; if ($LASTEXITCODE -ne 0) { throw "npm $($args -join ' ') falhou (código $LASTEXITCODE)" } }
# Valor sugerido: variável CFG_<CHAVE> (instalação automatizada) > .env atual > padrão.
function Padrao($chave, $padrao) {
  $cfg = [Environment]::GetEnvironmentVariable("CFG_$chave")
  if ($cfg) { return $cfg }
  return (LerEnv $chave $padrao)
}
function LerEnv($chave, $padrao) {
  if (-not (Test-Path .env)) { return $padrao }
  $linha = Get-Content .env | Where-Object { $_ -match "^\s*$chave\s*=" } | Select-Object -First 1
  if (-not $linha) { return $padrao }
  $v = ($linha -replace "^\s*$chave\s*=\s*", '').Trim().Trim("'").Trim('"')
  if ($v) { return $v } else { return $padrao }
}

Write-Host ''
Write-Host '  Painel de Silos - HE Laticinios / Althium Ingredients' -ForegroundColor Green
Write-Host "  Instalador para Windows  ($PSScriptRoot)" -ForegroundColor DarkGray

# ---------- 0. Administrador ----------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin -and -not $SemServico) {
  Write-Host "`nPedindo permissão de administrador..." -ForegroundColor Yellow
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"")
  if ($SemFirewall) { $argumentos += '-SemFirewall' }
  if ($NaoInterativo) { $argumentos += '-NaoInterativo' }
  try { Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentos } catch { Falha 'Permissão de administrador negada.' }
  exit 0
}

if ($PSScriptRoot -match '\\(Downloads|Desktop|Área de Trabalho|OneDrive|Temp)\\') {
  Aviso 'O painel está numa pasta temporária/de usuário. Recomendado: C:\PainelSilos'
  if (-not $NaoInterativo -and -not (Confirmar 'Continuar mesmo assim?' $false)) { exit 1 }
}

# ---------- 1. Node.js ----------
Etapa 'Node.js'
function VersaoNode {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  return [version]((& node -v).TrimStart('v'))
}
$versao = VersaoNode
if (-not $versao -or $versao -lt $NODE_MINIMO) {
  if ($versao) { Aviso "Node.js $versao é antigo (mínimo $NODE_MINIMO)." } else { Aviso 'Node.js não encontrado.' }
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget -and (Confirmar 'Instalar o Node.js LTS agora pelo winget?')) {
    & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $versao = VersaoNode
  }
  if (-not $versao -or $versao -lt $NODE_MINIMO) {
    Falha "Instale o Node.js LTS (22 ou mais novo) em https://nodejs.org/ e rode o instalador de novo."
  }
}
Ok "Node.js $versao"

# ---------- 2. Dependências ----------
Etapa 'Dependências'
$preCompilado = Test-Path 'web\dist\index.html'
try {
  if ($preCompilado) {
    Npm ci --omit=dev --no-audit --no-fund
    Ok 'Dependências instaladas (site já vem compilado no pacote)'
  } else {
    Npm ci --no-audit --no-fund
    Npm run build
    Ok 'Dependências instaladas e site compilado'
  }
} catch { Falha $_.Exception.Message }

# ---------- 3. Configuração ----------
Etapa 'Configuração (.env)'
$reconfigurar = -not (Test-Path .env)
if (-not $reconfigurar) {
  Ok '.env já existe (mantido)'
  $reconfigurar = (-not $NaoInterativo) -and (Confirmar 'Quer revisar a conexão com o banco da IHM?' $false)
}
if ($reconfigurar) {
  Write-Host '    Dados do banco MySQL onde a IHM grava o nível dos silos:' -ForegroundColor Gray
  if (-not $env:CFG_FONTE_DADOS) { $env:CFG_FONTE_DADOS = 'mysql' }
  $env:CFG_DB_HOST = Perguntar '    Endereço (IP) do banco' (Padrao 'DB_HOST' '10.5.0.111')
  $env:CFG_DB_PORT = Perguntar '    Porta' (Padrao 'DB_PORT' '3306')
  $env:CFG_DB_NAME = Perguntar '    Nome do banco' (Padrao 'DB_NAME' 'weintek')
  $env:CFG_DB_TABELA = Perguntar '    Tabela dos silos' (Padrao 'DB_TABELA' 'silo')
  $env:CFG_DB_USER = Perguntar '    Usuário do banco (recomendado: só leitura)' (Padrao 'DB_USER' 'painel_silos')
  if (-not $NaoInterativo) {
    $seguro = Read-Host '    Senha do banco' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($senha) { $env:CFG_DB_PASSWORD = $senha }
  }
  $env:CFG_PORT = Perguntar '    Porta do painel na rede' (Padrao 'PORT' '12322')
  try { & node scripts/configurar-env.js | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'falhou' } } catch { Falha 'Não foi possível gravar o .env.' }
  finally { Remove-Item Env:CFG_DB_PASSWORD -ErrorAction SilentlyContinue }
  Ok '.env gravado'
}
if (-not $SemServico) {
  # O .env tem a senha do banco: só administradores e o serviço (SYSTEM) podem ler.
  & icacls .env /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  Ok '.env com acesso restrito a administradores e ao serviço'
}

# ---------- 4. Usuário administrador ----------
Etapa 'Usuários'
& node -e "try{const u=require(require('path').resolve('data/usuarios.json')).usuarios||[];process.exit(u.some(x=>x.papel==='admin')?0:1)}catch{process.exit(1)}"
$temAdmin = ($LASTEXITCODE -eq 0)
if ($temAdmin) {
  Ok 'Já existe administrador cadastrado'
} else {
  $nomeAdmin = Perguntar '    Nome de usuário do administrador' 'admin'
  if ($NaoInterativo -and -not $env:PAINEL_SENHA) { Falha 'Modo não interativo: defina PAINEL_SENHA para criar o administrador.' }
  & npm.cmd run usuario --silent -- adicionar $nomeAdmin --admin
  if ($LASTEXITCODE -ne 0) { Falha 'Não foi possível criar o administrador.' }
  Ok "Administrador '$nomeAdmin' criado"
}

# ---------- 5. Diagnóstico ----------
Etapa 'Diagnóstico'
& npm.cmd run diagnostico --silent
if ($LASTEXITCODE -ne 0) {
  Aviso 'O diagnóstico encontrou problemas (veja acima).'
  if (-not (Confirmar 'Continuar a instalação mesmo assim?' $false)) { Falha 'Corrija os itens marcados com X e rode o instalador de novo.' }
}

$porta = LerEnv 'PORT' '12322'

if ($SemServico) {
  Etapa 'Pronto (sem serviço)'
  Write-Host "    Para iniciar manualmente:  npm start" -ForegroundColor Gray
  Write-Host "    Depois acesse:             http://localhost:$porta" -ForegroundColor Gray
  exit 0
}

# ---------- 6. Firewall ----------
if (-not $SemFirewall) {
  Etapa "Firewall (porta $porta)"
  $regra = 'Painel de Silos'
  Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $regra -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow -Profile Domain, Private | Out-Null
  Ok 'Liberada para redes privada e de domínio (não para redes públicas)'
}

# ---------- 7. Serviço ----------
Etapa 'Serviço do Windows'
$servico = Get-Service | Where-Object { $_.DisplayName -eq 'Painel de Silos' } | Select-Object -First 1
if ($servico) {
  & npm.cmd run servico --silent -- reiniciar
  Ok 'Serviço já existia: reiniciado com a versão nova'
} else {
  & npm.cmd run servico --silent -- instalar
  Ok 'Serviço "Painel de Silos" instalado (início automático)'
}

Write-Host '    Aguardando o painel responder...' -ForegroundColor Gray
$respondeu = $false
for ($i = 0; $i -lt 30 -and -not $respondeu; $i++) {
  Start-Sleep -Seconds 1
  try {
    $saude = Invoke-RestMethod "http://127.0.0.1:$porta/api/saude" -TimeoutSec 3
    $respondeu = $true
  } catch {
    # 503 = painel no ar, mas sem comunicação com o banco
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503) { $respondeu = $true; $saude = @{ comunicacao = 'falha' } }
  }
}
if ($respondeu) { Ok "Painel no ar (comunicação com a IHM: $($saude.comunicacao))" }
else { Aviso 'O serviço foi instalado mas ainda não respondeu. Veja a pasta logs\ e o "Visualizador de Eventos".' }

# ---------- 8. Atalho ----------
$atalho = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Painel de Silos.url'
"[InternetShortcut]`r`nURL=http://localhost:$porta/`r`nIconFile=$PSScriptRoot\web\dist\marca\favicon-64.png`r`nIconIndex=0" | Set-Content -Path $atalho -Encoding ASCII
Ok 'Atalho "Painel de Silos" criado na área de trabalho'

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress
Write-Host "`n  Instalação concluída!" -ForegroundColor Green
Write-Host "  Neste computador:  http://localhost:$porta"
foreach ($ip in $ips) { Write-Host "  Na rede:           http://${ip}:$porta" }
Write-Host "`n  Diagnóstico a qualquer momento:  npm run diagnostico" -ForegroundColor Gray
Write-Host "  Desinstalar:                     desinstalar.bat" -ForegroundColor Gray
