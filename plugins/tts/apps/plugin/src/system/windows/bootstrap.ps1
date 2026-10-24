# Passed to powershell.exe as -EncodedCommand. It reads the engine's script
# from the first line of stdin (base64 UTF-8) and runs it here, handing it the
# same reader so that no request already buffered is lost: a command line
# holds 32K characters, which a script encoded as UTF-16 base64 soon outgrows.

# Under AppLocker or WDAC, PowerShell runs in ConstrainedLanguage mode, where
# neither COM nor WinRT nor most .NET types are allowed. Only a cmdlet and a
# string are used before this check; the JSON escape keeps the line ASCII.
$mode = [string]$ExecutionContext.SessionState.LanguageMode
if ($mode -ne 'FullLanguage') {
  Write-Output ('{"unavailable":"PowerShell runs in ' + $mode + ' mode \u2014 Text to Speech cannot run on this machine"}')
  exit 3
}

$stdin = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
. ([ScriptBlock]::Create([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($stdin.ReadLine()))))
