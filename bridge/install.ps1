<#
.SYNOPSIS
	Installs the Manna attendance bridge on this Windows PC.

.DESCRIPTION
	Double-click INSTALL.bat beside this file rather than running this directly;
	it gets past the execution policy a fresh Windows ships with.

	  1. finds Python 3.11 or newer, and installs 3.12 with winget if there is none
	  2. copies the bridge to C:\MannaBridge and installs its two libraries
	  3. asks for the ERPNext key and finds the fingerprint machines
	  4. runs one pass, so punches are seen arriving before anybody walks away
	  5. registers a Scheduled Task that starts it at every boot, as SYSTEM

	Run it again to upgrade the code or to add a machine. The config, the key
	and the queue of undelivered punches are all kept.

	This file is ASCII on purpose. Windows PowerShell 5.1 reads a script without
	a byte-order mark in the system code page, and one stray dash from a word
	processor turns into a parse error on somebody else's PC.

.PARAMETER InstallDir
	Where the bridge lives. No need to change it; one bridge per PC.

.PARAMETER Reconfigure
	Go straight to the setup questions, even when this PC is already set up.

.PARAMETER Status
	Show whether the bridge is running and the end of its log.

.PARAMETER Uninstall
	Stop the bridge and remove its task. Every file is left where it is,
	including punches that have not reached ERPNext yet.

.PARAMETER Replace
	Remove the installed bridge before installing this one, rather than copying
	over it. Kept: config.toml, bridge.env, punches.sqlite3 and machine-backups
	- the setup, the key, the punches that have not reached ERPNext, and the
	fingerprint backups, none of which can be made again from here. The
	auto-install zip does this by itself.
#>
param(
	[string]$InstallDir = 'C:\MannaBridge',
	[switch]$Reconfigure,
	[switch]$Status,
	[switch]$Uninstall,
	[switch]$Replace
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Manna Attendance Bridge'
$InstallDir = $InstallDir.TrimEnd('\')

# Copied by name, never as a folder. The working copy this runs from may be a
# developer's, holding config.toml, a run-bridge.bat with a live key in it, and
# a queue of somebody else's punches.
$Files = @(
	'mannabridge', 'probe.py', 'check_push.py', 'requirements.txt', 'config.example.toml',
	'known_machines.toml', 'README.md', 'INSTALL.bat', 'install.ps1', 'install.sh', 'package.ps1',
	'machine.py', 'machine_menu.py', 'push_users.py', 'employee_tools.py', 'MACHINE.bat'
)

# An auto-install zip (package.ps1 -Auto) carries this beside the installer, and
# its presence is the whole switch: every question gets its default, the machine
# answers come from the file, and nothing waits for a keyboard. It holds the API
# key, so it is deleted once the key is in bridge.env and locked.
$AutoFile = Join-Path $PSScriptRoot 'autoinstall.toml'
$Auto = (Test-Path $AutoFile) -and -not $Reconfigure -and -not $Status -and -not $Uninstall

# The zip replaces whatever is on the PC: nobody is there to be asked, and a
# file left behind by an older version is the failure nobody would connect to
# this install. What is kept is in $Keep - the key, the config and the punches.
if ($Auto) { $Replace = $true }

function Test-Administrator {
	$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
	return (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
		[Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
	# A task that runs as SYSTEM, a key file only SYSTEM can read and a folder
	# on C:\ all need an administrator, so ask once, up front.
	$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
		'-InstallDir', "`"$InstallDir`"")
	if ($Reconfigure) { $arguments += '-Reconfigure' }
	if ($Status) { $arguments += '-Status' }
	if ($Uninstall) { $arguments += '-Uninstall' }
	if ($Replace) { $arguments += '-Replace' }
	Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
	exit
}

function Step([string]$Text) {
	Write-Host ''
	Write-Host "== $Text" -ForegroundColor Cyan
}

function Ask-Yes([string]$Prompt, [bool]$Default = $true) {
	if ($script:Auto) {
		$said = if ($Default) { 'yes' } else { 'no' }
		Write-Host "  $Prompt -> $said (automatic)"
		return $Default
	}
	$hint = if ($Default) { 'Y/n' } else { 'y/N' }
	while ($true) {
		$answer = (Read-Host "  $Prompt ($hint)").Trim().ToLower()
		if ($answer -eq '') { return $Default }
		if ($answer -eq 'y' -or $answer -eq 'yes') { return $true }
		if ($answer -eq 'n' -or $answer -eq 'no') { return $false }
	}
}

function Get-PythonPath([string]$Exe, [string[]]$Prefix) {
	# The real interpreter behind a command, when it is 3.11 or newer (the bridge
	# needs tomllib). Anything that fails to answer is simply not a candidate.
	try {
		$out = & $Exe @Prefix -c "import sys; print(sys.executable if sys.version_info >= (3, 11) else '')" 2>$null
		if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
		$path = ([string]($out | Select-Object -Last 1)).Trim()
		# The Microsoft Store's Python lives in a per-user app container that
		# SYSTEM cannot start, so a bridge built on it installs cleanly and then
		# never runs at boot.
		if (-not $path -or $path -match '\\WindowsApps\\') { return $null }
		return $path
	} catch {
		return $null
	}
}

function Find-Python {
	$candidates = @(
		@{ Exe = 'py'; Args = @('-3.12') },
		@{ Exe = 'py'; Args = @('-3.13') },
		@{ Exe = 'py'; Args = @('-3') },
		@{ Exe = 'python'; Args = @() },
		@{ Exe = "$env:ProgramFiles\Python312\python.exe"; Args = @() }
	)
	foreach ($candidate in $candidates) {
		$found = Get-PythonPath $candidate.Exe $candidate.Args
		if ($found) { return $found }
	}
	return $null
}

function Install-PythonDirect {
	# For a Windows without winget - LTSC, an old Windows 10, a PC that has never
	# opened the Store. The same 3.12 build, straight from python.org, refused
	# unless Windows says the Python Software Foundation signed it: this runs as
	# administrator, and an unsigned exe from a hijacked connection would too.
	$url = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'
	$exe = Join-Path $env:TEMP 'python-3.12.10-amd64.exe'
	Write-Host "  Downloading Python 3.12 from python.org ..."
	[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
	# The progress bar makes Invoke-WebRequest in Windows PowerShell 5.1 many
	# times slower; a 25 MB download goes from seconds to minutes.
	$ProgressPreference = 'SilentlyContinue'
	Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
	$signature = Get-AuthenticodeSignature $exe
	if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') {
		Remove-Item $exe -Force -ErrorAction SilentlyContinue
		throw 'The Python download was not signed by the Python Software Foundation, so it was not run.'
	}
	Write-Host '  Installing Python 3.12 for all users ...'
	$run = Start-Process -FilePath $exe -ArgumentList '/quiet', 'InstallAllUsers=1', 'PrependPath=1', 'Include_test=0' -Wait -PassThru
	Remove-Item $exe -Force -ErrorAction SilentlyContinue
	if ($run.ExitCode -ne 0) { throw "The Python installer stopped with code $($run.ExitCode)." }
}

function Stop-Bridge {
	if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
		Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
	}
	# Stopping the task ends cmd.exe and not necessarily the python it started,
	# which would go on reading machines with the old code. Only a bridge whose
	# own process, or whose parent's, sits in this install is stopped: a
	# developer's copy running elsewhere on the same PC is not ours to kill.
	$root = $InstallDir + '\'
	$all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
	$byId = @{}
	foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
	foreach ($p in $all) {
		if (-not $p.CommandLine -or $p.CommandLine -notmatch 'mannabridge\.main') { continue }
		$chain = @($p)
		$parent = $byId[[int]$p.ParentProcessId]
		if ($parent) {
			$chain += $parent
			$grandparent = $byId[[int]$parent.ParentProcessId]
			if ($grandparent) { $chain += $grandparent }
		}
		foreach ($q in $chain) {
			$inside = ($q.ExecutablePath -and $q.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or
				($q.CommandLine -and $q.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0)
			if ($inside) {
				Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
				break
			}
		}
	}
}

function Show-Status {
	$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
	if ($task) {
		$info = Get-ScheduledTaskInfo -TaskName $TaskName
		Write-Host "  Task:      $($task.State) (last started $($info.LastRunTime))"
	} else {
		Write-Host '  Task:      not installed'
	}
	$log = Join-Path $InstallDir 'bridge.log'
	if (Test-Path $log) {
		Write-Host "  Log:       $log"
		Write-Host ''
		Get-Content $log -Tail 15 | ForEach-Object { Write-Host "    $_" }
	}
}

# Never removed by -Replace, whatever else goes. The first two are the only copy
# of this PC's setup and its key; the third holds punches that have not reached
# ERPNext yet, and deleting it is deleting somebody's day. The backups hold
# fingerprint templates that cannot be made again from here.
# `.venv` is kept as well, and checked rather than rebuilt: a plant on a slow
# line pays for that download, and a venv whose Python has gone is detected and
# replaced a few steps below anyway.
$Keep = @('config.toml', 'bridge.env', 'punches.sqlite3', 'punches.sqlite3-wal',
	'punches.sqlite3-shm', 'machine-backups', 'run-bridge.bat.old', '.venv')

function Remove-OldBridge {
	# The code, and nothing else. A version that dropped a module leaves it
	# behind on a plain upgrade, and an import that still finds it runs code
	# nobody shipped.
	if (-not (Test-Path $InstallDir)) { return }
	foreach ($item in Get-ChildItem -Force $InstallDir) {
		if ($Keep -contains $item.Name) { continue }
		if ($item.Extension -in @('.log', '.1')) { continue }
		Remove-Item -Recurse -Force $item.FullName -ErrorAction SilentlyContinue
	}
	Write-Host "  The old bridge is removed. Kept: the config, the key, and $((Join-Path $InstallDir 'punches.sqlite3'))."
}

function Copy-Bridge {
	$from = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
	New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
	if ($from -ieq [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')) { return }
	foreach ($item in $Files) {
		$path = Join-Path $from $item
		if (-not (Test-Path $path)) { continue }
		$target = Join-Path $InstallDir $item
		if ((Get-Item $path).PSIsContainer) {
			# Replaced whole, so a module an older version had and this one
			# dropped cannot linger and be imported.
			if (Test-Path $target) { Remove-Item -Recurse -Force $target }
			Copy-Item -Recurse -Force $path $target
			Get-ChildItem $target -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
		} else {
			Copy-Item -Force $path $target
		}
	}
}

function Write-Runner {
	$runner = @'
@echo off
REM Written by install.ps1, and rewritten each time it runs. Started at boot by
REM the Scheduled Task "Manna Attendance Bridge".
REM
REM No key in here: the bridge reads bridge.env, beside config.toml.
REM
REM The loop is why this is a .bat and not the task starting python itself. If
REM python dies - a network stack that went away, an unhandled error - it is
REM back within thirty seconds instead of whenever the task's own restart fires.

setlocal
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

:loop
REM Two files of 20 MB at most. Rotated between runs, the only moment nothing
REM holds the log open.
if exist bridge.log for %%F in (bridge.log) do if %%~zF GTR 20000000 move /y bridge.log bridge.log.1 > nul
".venv\Scripts\python.exe" -m mannabridge.main >> bridge.log 2>&1
echo %date% %time% bridge exited, restarting in 30s >> bridge.log
REM `ping` and not `timeout`: under SYSTEM there is no console for timeout to
REM read, it fails at once, and this loop becomes a hot spin.
ping -n 31 127.0.0.1 > nul
goto loop
'@
	$path = Join-Path $InstallDir 'run-bridge.bat'
	if (Test-Path $path) {
		$current = [IO.File]::ReadAllText($path)
		if ($current -match 'MANNA_API_(KEY|SECRET)=') {
			# An older hand-made runner with the key typed into it. Moved aside,
			# not deleted, so nobody loses the only copy of a key they need.
			Move-Item -Force $path "$path.old"
			& icacls.exe "$path.old" /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
			Write-Host "  The old run-bridge.bat had the key typed into it; it is now run-bridge.bat.old."
		}
	}
	# cmd.exe misreads labels and goto in a file with bare LF line endings, and
	# git may have checked this script out with either.
	$runner = $runner -replace "`r?`n", "`r`n"
	[IO.File]::WriteAllText($path, $runner, (New-Object Text.ASCIIEncoding))
}

function Register-BridgeTask {
	$runner = Join-Path $InstallDir 'run-bridge.bat'
	$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$runner`"" -WorkingDirectory $InstallDir
	$trigger = New-ScheduledTaskTrigger -AtStartup
	$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
	# ExecutionTimeLimit zero is "forever". The default is three days, after
	# which Windows ends the task without a word and attendance stops on a
	# Thursday.
	$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
		-StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
		-RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
	Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
		-Settings $settings -Force `
		-Description 'Reads the fingerprint machines and sends every punch to ERPNext. Installed by install.ps1.' | Out-Null
	Start-ScheduledTask -TaskName $TaskName
}

function Install-MachineTools {
	# Backups hold fingerprint templates and every user's keypad password, so
	# the folder is locked the way bridge.env is: SYSTEM and Administrators, by SID.
	$backups = Join-Path $InstallDir 'machine-backups'
	New-Item -ItemType Directory -Force -Path $backups | Out-Null
	& icacls.exe $backups /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
	if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not restrict machine-backups. Restrict it by hand.' }

	# The Public desktop, so it is there for whoever logs in to look after the gate.
	$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
	$shell = New-Object -ComObject WScript.Shell
	$link = $shell.CreateShortcut((Join-Path $desktop 'Manna Machine Tools.lnk'))
	$link.TargetPath = Join-Path $InstallDir 'MACHINE.bat'
	$link.WorkingDirectory = $InstallDir
	$link.Description = 'The fingerprint machines: users, fingers, clock, backup and restore'
	$link.Save()
	Write-Host "  'Manna Machine Tools' is on the desktop. Backups go to $backups"
}

function Install-Bridge {
	Write-Host ''
	Write-Host 'Manna attendance bridge - installer' -ForegroundColor Cyan
	Write-Host "Installs into $InstallDir and runs at every boot, whoever is logged in."

	Step 'Python'
	$python = Find-Python
	if (-not $python -and (Get-Command winget -ErrorAction SilentlyContinue)) {
		Write-Host '  No Python 3.11 or newer here. Installing Python 3.12 for all users ...'
		try {
			& winget install --exact --id Python.Python.3.12 --scope machine --silent `
				--accept-package-agreements --accept-source-agreements
		} catch {
			Write-Host "  winget: $_"
		}
		$python = Get-PythonPath "$env:ProgramFiles\Python312\python.exe" @()
	}
	if (-not $python) {
		try {
			Install-PythonDirect
		} catch {
			Write-Host "  $_"
		}
		$python = Get-PythonPath "$env:ProgramFiles\Python312\python.exe" @()
	}
	if (-not $python) {
		throw ('Python 3.11 or newer is needed. Install it from https://www.python.org/downloads/windows/ ' +
			'with "Install for all users" ticked, then run INSTALL.bat again.')
	}
	Write-Host "  $python"

	Step "Copying the bridge to $InstallDir"
	Stop-Bridge
	if ($Replace) {
		# After Stop-Bridge, never before: files held open by a running bridge
		# are the ones that fail to delete, and the queue is one of them.
		Remove-OldBridge
	}
	Copy-Bridge

	Step 'Installing libraries'
	$venvPython = Join-Path $InstallDir '.venv\Scripts\python.exe'
	$healthy = $false
	if (Test-Path $venvPython) {
		# In a try because a venv whose Python has gone says so on stderr, and
		# Windows PowerShell turns redirected stderr into a terminating error.
		try {
			& $venvPython -c 'import sys' 2>$null
			$healthy = ($LASTEXITCODE -eq 0)
		} catch {
			$healthy = $false
		}
	}
	if (-not $healthy) {
		# Missing, or built on a Python that has since been removed or upgraded.
		$venv = Join-Path $InstallDir '.venv'
		if (Test-Path $venv) { Remove-Item -Recurse -Force $venv }
		& $python -m venv $venv
		if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
	}
	& $venvPython -m pip install --disable-pip-version-check --quiet -r (Join-Path $InstallDir 'requirements.txt')
	if ($LASTEXITCODE -ne 0) { throw 'Could not install the libraries. This step needs the internet.' }
	Write-Host '  done'

	Push-Location $InstallDir
	try {
		$env:PYTHONIOENCODING = 'utf-8'
		$configured = (Test-Path 'config.toml') -and (Test-Path 'bridge.env')
		if ($Auto) {
			# Run even on a PC already set up: it keeps every machine it has and
			# adds any new one it finds, which is what running the zip again means.
			& $venvPython -m mannabridge.wizard --auto $AutoFile
			if ($LASTEXITCODE -ne 0) { throw 'Automatic setup did not finish, so the bridge has not been started.' }
		} else {
			$ask = $true
			if ($configured -and -not $Reconfigure) {
				Step 'Setup'
				$ask = Ask-Yes 'This PC is already set up. Change the key or the machines?' $false
			}
			if ($ask) {
				& $venvPython -m mannabridge.wizard
				if ($LASTEXITCODE -ne 0) { throw 'Setup did not finish, so the bridge has not been started.' }
			}
		}

		# SYSTEM runs the bridge and Administrators look after it. Nobody else
		# on this PC should be able to read a key that writes the whole group's
		# attendance. SIDs rather than names, which are translated on a Windows
		# installed in another language.
		& icacls.exe 'bridge.env' /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
		if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not restrict bridge.env. Restrict it by hand.' }

		# A machine that pushes connects *in*, and Windows Firewall drops an
		# unsolicited connection without a word - so the machine retries forever,
		# the log never says "said hello", and nothing on this PC says why.
		$admsPort = ''
		try {
			$admsPort = (& $venvPython -c "from mannabridge.config import load_config; c = load_config('config.toml'); print(c.adms_port if c.listens else '')" 2>$null | Select-Object -Last 1)
		} catch { $admsPort = '' }
		if ($admsPort -match '^\d+$') {
			Step "Firewall: machines push to port $admsPort"
			Get-NetFirewallRule -DisplayName 'Manna Bridge ADMS' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
			New-NetFirewallRule -DisplayName 'Manna Bridge ADMS' -Direction Inbound -Protocol TCP `
				-LocalPort ([int]$admsPort) -Action Allow -Profile Any | Out-Null
			Write-Host "  Inbound TCP $admsPort is open for the fingerprint machines."
		}

		Step 'Test: one pass now'
		Write-Host '  Reads each machine and sends new punches to ERPNext. A machine holding'
		Write-Host '  years of punches takes a minute or two to read.'
		Write-Host ''
		& $venvPython -m mannabridge.main --once
		Write-Host ''
		Write-Host '  Look for "pass complete" above. "could not be read" means a machine did'
		Write-Host '  not answer; "matches no Employee" means somebody needs their Attendance'
		Write-Host '  Device ID filled in on their Employee record.'
	} finally {
		Pop-Location
	}

	# Before the boot question, which returns early when it is answered no.
	Step 'Machine tools'
	Install-MachineTools

	Step 'Running it at every boot'
	if (-not (Ask-Yes 'Start the bridge now, and at every boot from now on?')) {
		Write-Host '  Not started. Run INSTALL.bat again when it should be.'
		return
	}
	Write-Runner
	Register-BridgeTask
	Write-Host "  Scheduled Task `"$TaskName`" is registered and started."

	Step 'Power'
	if (Ask-Yes 'Stop this PC sleeping while plugged in? A sleeping PC reads no machines') {
		& powercfg.exe /change standby-timeout-ac 0
		& powercfg.exe /change hibernate-timeout-ac 0
		Write-Host '  Sleep is off while on mains power.'
	}

	Step 'Status'
	Start-Sleep -Seconds 5
	Show-Status
	Write-Host ''
	if ($Auto) {
		# Last, so an install that stopped part way leaves the file and running
		# the zip again is still automatic. By now the key is in bridge.env,
		# locked, and this copy in somebody's Downloads is only a liability.
		Remove-Item -Force $AutoFile -ErrorAction SilentlyContinue
		Write-Host '  The key file from the zip is deleted. Delete the zip too - it holds the key.'
	}
	Write-Host 'Installed.' -ForegroundColor Green
	Write-Host "  Check on it any time:   INSTALL.bat -Status"
	Write-Host "  Add a machine:          INSTALL.bat -Reconfigure"
	Write-Host "  The log:                $InstallDir\bridge.log"
	$script:Installed = $true
}

try {
	if ($Uninstall) {
		Stop-Bridge
		Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
		Write-Host "Stopped, and the task is removed. Every file is still in $InstallDir, including"
		Write-Host 'punches.sqlite3, which holds any punch not yet in ERPNext. Delete that folder only'
		Write-Host 'after the log has said "0 waiting".'
	} elseif ($Status) {
		Show-Status
	} else {
		Install-Bridge
	}
} catch {
	Write-Host ''
	Write-Host "Stopped: $_" -ForegroundColor Red
} finally {
	Write-Host ''
	if ($Auto -and $script:Installed) {
		# Automatic means nobody has to be there to close it either. Held for a
		# minute so whoever is watching can read the result.
		Write-Host 'This window closes by itself in 60 seconds.'
		Start-Sleep -Seconds 60
	} else {
		# Elevation opened this in a window of its own, which would otherwise
		# close on the one line that says what went wrong.
		Read-Host 'Press Enter to close' | Out-Null
	}
}
