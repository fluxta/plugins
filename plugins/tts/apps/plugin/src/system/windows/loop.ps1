# The loop every Windows engine runs: JSON lines in on stdin ($stdin, from the
# bootstrap), JSON lines out on stdout. Requests come escaped to ASCII, so the
# console's code page plays no part; replies are written as UTF-8 here, as the
# sidecar reads them. The engine's script defines Receive (one request) and
# Step (the work under way: $true while there is some), then calls Run.
#
# Windows PowerShell 5.1: nothing from PowerShell 7. Every call whose result
# is not wanted goes to $null — a stray value would become a function's
# return value.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$stdout = [System.IO.StreamWriter]::new([Console]::OpenStandardOutput(), [System.Text.UTF8Encoding]::new($false))
$stdout.AutoFlush = $true

function Send($message) {
  $stdout.WriteLine((ConvertTo-Json -InputObject $message -Compress -Depth 6))
}

# Audio goes out by hand: base64 needs no escaping, and ConvertTo-Json would
# take its time over a string of megabytes.
function SendAudio($id, [string]$field, [byte[]]$bytes, [string]$extra) {
  $stdout.WriteLine('{"id":' + $id + ',"' + $field + '":"' + [Convert]::ToBase64String($bytes) + '"' + $extra + '}')
}

function Fail($id, [string]$kind, [string]$reason) {
  Send @{ id = $id; error = @{ kind = $kind; reason = $reason } }
}

function Run {
  Send @{ ready = $true }
  $next = $stdin.ReadLineAsync()
  while ($true) {
    $busy = Step
    # A request ends the wait the moment it arrives; while something plays,
    # the loop also comes round every 5 ms to watch it.
    $wait = 1000
    if ($busy) { $wait = 5 }
    if (-not $next.Wait($wait)) { continue }
    $line = $next.Result
    # End of stdin: the sidecar has gone, and so does this engine.
    if ($null -eq $line) { return }
    $next = $stdin.ReadLineAsync()
    if ($line.Trim().Length -eq 0) { continue }
    $request = $null
    try {
      $request = ConvertFrom-Json $line
      Receive $request
    } catch {
      $reason = $_.Exception.Message
      [Console]::Error.WriteLine('A request failed: ' + $reason)
      if ($null -ne $request -and $null -ne $request.id) {
        Fail $request.id 'unavailable' $reason
      }
    }
  }
}
