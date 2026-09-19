<#
.SYNOPSIS
	Builds the zip that carries the bridge and its installers to another PC.

.DESCRIPTION
	    powershell -ExecutionPolicy Bypass -File bridge\package.ps1          # MannaBridge.zip
	    powershell -ExecutionPolicy Bypass -File bridge\package.ps1 -Auto    # MannaBridge-auto.zip
	    powershell -ExecutionPolicy Bypass -File bridge\package.ps1 -Auto -CommKeys 400002

	MannaBridge.zip asks its questions on the other PC. MannaBridge-auto.zip asks
	none: it carries autoinstall.toml with the site and the API key, so INSTALL.bat
	finds the machines, names them, and starts the bridge with nobody at the
	keyboard beyond Windows' own administrator prompt.

	**The auto zip is a key.** Anybody holding it can write attendance for the
	whole group. Send it the way a password would be sent, and delete it once the
	PC is installed; the installer deletes its own extracted copy of the key file.

	The key for -Auto comes from MANNA_API_KEY / MANNA_API_SECRET in the
	environment, else bridge.env beside this script, else this PC's
	run-bridge.bat. It is checked against the site before anything is built, so a
	zip never goes out holding a key the site has already stopped accepting.

	Files are taken by name and never as the folder. This folder, on a PC that
	already runs a bridge, holds config.toml, run-bridge.bat with a live key
	typed into it, bridge.env and the punch queue - and a zip of the folder
	would hand all four to whoever the zip is sent to.

	ASCII only: Windows PowerShell 5.1 reads a script without a byte-order mark
	in the system code page.
#>
param(
	[switch]$Auto,
	# Comm keys the auto install tries on every machine it finds, after 0 (none).
	# e.g. -CommKeys 400002, or -CommKeys "400002,1234" for sites that differ.
	[string]$CommKeys = '',
	[string]$Out = ''
)

$ErrorActionPreference = 'Stop'

$Files = @(
	'mannabridge', 'probe.py', 'check_push.py', 'requirements.txt', 'config.example.toml',
	'known_machines.toml', 'README.md', 'INSTALL.bat', 'install.ps1', 'install.sh', 'package.ps1',
	'machine.py', 'machine_menu.py', 'push_users.py', 'employee_tools.py', 'MACHINE.bat',
	'console.py', 'console.html', 'CONSOLE.bat', 'MannaHRConsole.vbs'
)

if (-not $Out) {
	$Out = Join-Path $PSScriptRoot $(if ($Auto) { 'dist\MannaBridge-auto.zip' } else { 'dist\MannaBridge.zip' })
}

function Find-Key {
	if ($env:MANNA_API_KEY -and $env:MANNA_API_SECRET) {
		return @{ Key = $env:MANNA_API_KEY; Secret = $env:MANNA_API_SECRET }
	}
	foreach ($name in @('bridge.env', 'run-bridge.bat')) {
		$path = Join-Path $PSScriptRoot $name
		if (-not (Test-Path $path)) { continue }
		$text = [IO.File]::ReadAllText($path)
		$key = [regex]::Match($text, '(?m)^\s*(?:set\s+)?MANNA_API_KEY=(\S+)').Groups[1].Value
		$secret = [regex]::Match($text, '(?m)^\s*(?:set\s+)?MANNA_API_SECRET=(\S+)').Groups[1].Value
		if ($key -and $secret) { return @{ Key = $key; Secret = $secret } }
	}
	throw 'No API key found. Set MANNA_API_KEY and MANNA_API_SECRET, then run this again.'
}

function Find-Site {
	$config = Join-Path $PSScriptRoot 'config.toml'
	if (Test-Path $config) {
		$url = [regex]::Match([IO.File]::ReadAllText($config), '(?m)^\s*url\s*=\s*"([^"]+)"').Groups[1].Value
		if ($url) { return $url.TrimEnd('/') }
	}
	return 'https://mannarubber.m.frappe.cloud'
}

$stage = Join-Path ([IO.Path]::GetTempPath()) ('MannaBridge-' + [Guid]::NewGuid().ToString('N'))
$root = Join-Path $stage 'MannaBridge'
New-Item -ItemType Directory -Force -Path $root | Out-Null

try {
	foreach ($item in $Files) {
		$path = Join-Path $PSScriptRoot $item
		if (-not (Test-Path $path)) { throw "missing $item - is this the bridge folder?" }
		Copy-Item -Recurse -Force $path (Join-Path $root $item)
	}
	Get-ChildItem $root -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force

	# A last look, because the list above is only as good as whoever edits it
	# next. None of these may ever leave this PC inside the zip.
	$leaks = Get-ChildItem $root -Recurse -File | Where-Object {
		$_.Name -in @('config.toml', 'bridge.env', 'run-bridge.bat', 'autoinstall.toml') -or
		$_.Extension -in @('.sqlite3', '.log', '.bak', '.old') -or
		# Fingerprint templates and keypad passwords, from machine.py backup.
		$_.FullName -match '\\machine-backups\\'
	}
	if ($leaks) { throw ('refusing to package ' + (($leaks | ForEach-Object { $_.Name }) -join ', ')) }

	if ($Auto) {
		$site = Find-Site
		$found = Find-Key
		[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
		try {
			$who = Invoke-RestMethod -Uri "$site/api/method/frappe.auth.get_logged_user" -TimeoutSec 30 `
				-Headers @{ Authorization = "token $($found.Key):$($found.Secret)"; Accept = 'application/json' }
		} catch {
			throw "The site did not accept the API key ($($_.Exception.Message)). Put the current key in run-bridge.bat or bridge.env first."
		}
		Write-Host "Key checked: $site signs it in as $($who.message)"

		$keys = @(0)
		foreach ($part in ($CommKeys -split '[,\s]+' | Where-Object { $_ })) {
			if ($part -notmatch '^\d{1,6}$') { throw "A comm key is a number of up to six digits; '$part' is not." }
			if ($keys -notcontains [int]$part) { $keys += [int]$part }
		}

		$autoText = @"
# Written by package.ps1 -Auto. It holds the ERPNext API key, so this zip is a
# key: INSTALL.bat stores it locked on the PC and deletes this file afterwards.

[erp]
url = "$site"
api_key = "$($found.Key)"
api_secret = "$($found.Secret)"

[machines]
# Tried in order on every machine found. 0 means no comm key is set.
comm_keys = [$($keys -join ', ')]
# Machines the network search cannot see - another subnet of the same plant -
# by IP address, e.g. hosts = ["192.168.5.40"].
hosts = []
# The first day sent: "month" (the 1st of the month it is installed in),
# "today", or a date like "15-09-2026".
start = "month"
"@
		[IO.File]::WriteAllText((Join-Path $root 'autoinstall.toml'), ($autoText -replace "`r?`n", "`n"), (New-Object Text.UTF8Encoding $false))
	}

	# install.sh has to reach Linux with LF endings whatever git checked out here.
	$sh = Join-Path $root 'install.sh'
	$text = [IO.File]::ReadAllText($sh) -replace "`r`n", "`n"
	[IO.File]::WriteAllText($sh, $text, (New-Object Text.UTF8Encoding $false))

	New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null
	if (Test-Path $Out) { Remove-Item -Force $Out }
	# ZipFile rather than Compress-Archive, which in Windows PowerShell 5.1
	# writes backslashes into entry names and unzips on Linux as flat files
	# called "MannaBridge\install.sh".
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	[IO.Compression.ZipFile]::CreateFromDirectory($root, $Out, [IO.Compression.CompressionLevel]::Optimal, $true)
	Write-Host "Built $Out"
	if ($Auto) {
		Write-Host 'This zip holds the API key. Send it like a password, and delete it once the PC is installed.' -ForegroundColor Yellow
	}
} finally {
	Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
