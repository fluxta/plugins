# The Windows Player's engine: WinRT's MediaPlayer plays a WAV file on one
# audio endpoint, one player per play. Endpoints are listed under the names
# Windows' sound settings show — "Speakers (Realtek(R) Audio)" — and known by
# their id, which Windows keeps across restarts and re-plugging. MediaPlayer
# tells nothing this loop can wait on, so the loop comes round every 5 ms
# while something plays to see how each play stands.
#
# A Phrase never moves to another device: the device decides who hears it.
# So each play is pinned to the endpoint it starts on — System default's too,
# or it would follow the default to another device — and cut off when that
# endpoint goes away or, on System default, stops being the default.

# How often a play on System default checks that its endpoint still is the
# default, and a play on a chosen device that the device is still here, in ms.
$DEFAULT_CHECK_MS = 20
$PRESENCE_CHECK_MS = 100
# How long a play may take to open its file and start. MediaPlayer reports
# some failures only through an event, which may not reach this script.
$START_TIMEOUT_MS = 5000
# A play that pauses this close to its end has ended, as MediaPlayer leaves
# it; further from it, something else stopped it.
$END_SLACK_MS = 250

# WinRT reaches Windows PowerShell 5.1 through .NET Framework's projection.
# Without it nothing plays, and every Phrase is dropped with the reason.
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Playback.MediaPlayer,Windows.Media.Playback,ContentType=WindowsRuntime]
  $null = [Windows.Media.Core.MediaSource,Windows.Media.Core,ContentType=WindowsRuntime]
  $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
  $null = [Windows.Media.Devices.MediaDevice,Windows.Media.Devices,ContentType=WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
} catch {
  Send @{ unavailable = ('Windows cannot play sound for Text to Speech on this computer: ' + $_.Exception.Message) }
  return
}

# A WinRT operation's result, waited for. Its own exception, not
# AggregateException, if it fails.
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}

$clock = [System.Diagnostics.Stopwatch]::StartNew()
# When each check last ran, in ms on $clock.
$checked = @{ default = 0; presence = 0 }
# Request id (as a string) -> @{ id; player; device; chosen; named; started; since; events }
$plays = @{}

# The endpoint Windows plays on by default right now — the output chosen in
# Settings > Sound — or '' when there is none.
function DefaultOutput {
  $id = $null
  try {
    $id = [Windows.Media.Devices.MediaDevice]::GetDefaultAudioRenderId([Windows.Media.Devices.AudioDeviceRole]::Default)
  } catch {}
  if ($null -eq $id) { return '' }
  [string]$id
}

# The endpoint with this id if it can play now, or $null. An unplugged or
# disabled endpoint keeps its id, but is not enabled.
function Endpoint([string]$id) {
  if (-not $id) { return $null }
  $endpoint = $null
  try {
    $endpoint = Await ([Windows.Devices.Enumeration.DeviceInformation]::CreateFromIdAsync($id)) ([Windows.Devices.Enumeration.DeviceInformation])
  } catch {
    return $null
  }
  if ($null -eq $endpoint -or -not $endpoint.IsEnabled) { return $null }
  $endpoint
}

# Every endpoint that can play, in Windows' order and under Windows' names.
function Devices($id) {
  $default = DefaultOutput
  $endpoints = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync([Windows.Media.Devices.MediaDevice]::GetAudioRenderSelector())) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  $list = New-Object System.Collections.ArrayList
  foreach ($endpoint in $endpoints) {
    $entry = @{ id = [string]$endpoint.Id; name = [string]$endpoint.Name }
    if ($entry.id -eq $default) { $entry.isDefault = $true }
    $null = $list.Add($entry)
  }
  Send @{ id = $id; devices = $list }
}

# `device` is an endpoint's id, or absent for the default output as it stands
# when the play starts; `name` is what the user chose it as, for the reasons.
function Play($request) {
  $chosen = [bool]$request.device
  if ($chosen) {
    $device = [string]$request.device
    $named = [string]$request.name
    if (-not $named) { $named = 'The output device' }
  } else {
    $device = DefaultOutput
    $named = 'The system default output'
  }
  $endpoint = Endpoint $device
  if ($null -eq $endpoint) {
    if ($chosen) {
      Fail $request.id 'device-missing' ($named + ' is not connected')
    } else {
      Fail $request.id 'device-missing' 'This computer has no output device'
    }
    return
  }
  $player = $null
  try {
    $player = [Windows.Media.Playback.MediaPlayer]::new()
    try {
      # Out of Windows' media flyout: a Phrase is not media to pause there.
      $player.CommandManager.IsEnabled = $false
    } catch {
      [Console]::Error.WriteLine('A Phrase may show in the media flyout: ' + $_.Exception.Message)
    }
    $player.AutoPlay = $false
    $player.AudioDevice = $endpoint
    # 0 to 1, set once as the play starts; 1 is the audio as it is.
    $player.Volume = [double]$request.volume
    # A file, not a URI: a path through a user folder named in Cyrillic
    # stays a path.
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync([string]$request.path)) ([Windows.Storage.StorageFile])
    $player.Source = [Windows.Media.Core.MediaSource]::CreateFromStorageFile($file)
  } catch {
    if ($null -ne $player) { $player.Dispose() }
    Fail $request.id 'unavailable' ('Windows cannot play the synthesized audio: ' + $_.Exception.Message)
    return
  }
  $key = [string]$request.id
  # MediaFailed is the only word of a file that cannot be played, or of an
  # endpoint lost under it; MediaEnded is the surest of the end. They are
  # queued for Get-Event, never run as actions. Without them the state alone
  # tells the end, and the timeouts a failure.
  $events = 'tts-player-' + $key
  try {
    $null = Register-ObjectEvent -InputObject $player -EventName MediaFailed -SourceIdentifier ($events + '-failed')
    $null = Register-ObjectEvent -InputObject $player -EventName MediaEnded -SourceIdentifier ($events + '-ended')
  } catch {
    [Console]::Error.WriteLine('MediaPlayer events cannot be watched: ' + $_.Exception.Message)
    Forget $events
    $events = $null
  }
  $plays[$key] = @{ id = $request.id; player = $player; device = $device; chosen = $chosen; named = $named; started = $false; since = $clock.ElapsedMilliseconds; events = $events }
  $player.Play()
}

# The first of an event of a play, or $null.
function Raised($events, [string]$name) {
  if (-not $events) { return $null }
  Get-Event -SourceIdentifier ($events + '-' + $name) -ErrorAction Ignore | Select-Object -First 1
}

function Forget($events) {
  foreach ($name in @('failed', 'ended')) {
    try { Unregister-Event -SourceIdentifier ($events + '-' + $name) -ErrorAction Ignore } catch {}
    try { Remove-Event -SourceIdentifier ($events + '-' + $name) -ErrorAction Ignore } catch {}
  }
}

# Stops a play's sound and lets go of its file.
function Release($key) {
  $play = $plays[$key]
  $plays.Remove($key)
  if ($play.events) { Forget $play.events }
  try { $play.player.Pause() } catch {}
  try { $play.player.Source = $null } catch {}
  try { $play.player.Dispose() } catch {}
}

function Cut($key, [string]$kind, [string]$reason, [string]$cause) {
  $id = $plays[$key].id
  # For the log: what gave it away — the event, the state or a check.
  [Console]::Error.WriteLine('Play ' + $key + ' cut off (' + $cause + '): ' + $reason)
  Release $key
  Fail $id $kind $reason
}

# A play that stopped short: its device went, the default moved, or the
# play itself failed.
function Interrupted($key, [string]$what, [string]$cause) {
  $play = $plays[$key]
  if ($play.chosen -and $null -eq (Endpoint $play.device)) {
    Cut $key 'device-missing' ($play.named + ' was disconnected while speaking') $cause
  } elseif (-not $play.chosen -and (DefaultOutput) -ne $play.device) {
    Cut $key 'transient' 'The system default output switched to another device while speaking' $cause
  } else {
    Cut $key 'transient' ($play.named + ' ' + $what) $cause
  }
}

function StopPlay($key) {
  if ($plays.ContainsKey($key)) { Release $key }
}

function Watch($key, $now, $default, [bool]$presence) {
  $play = $plays[$key]
  $session = $play.player.PlaybackSession
  $state = [string]$session.PlaybackState
  if (-not $play.started -and $state -eq 'Playing') {
    $play.started = $true
    Send @{ id = $play.id; started = $true }
  }
  if ($play.chosen) {
    if ($presence -and $null -eq (Endpoint $play.device)) {
      Cut $key 'device-missing' ($play.named + ' was disconnected while speaking') 'presence check'
      return
    }
  } elseif ($null -ne $default -and $default -ne $play.device) {
    Cut $key 'transient' 'The system default output switched to another device while speaking' 'default check'
    return
  }
  $failure = Raised $play.events 'failed'
  if ($null -ne $failure) {
    $message = [string]$failure.SourceEventArgs.ErrorMessage
    Interrupted $key ('could not play the sound: ' + $message) ('MediaFailed ' + $failure.SourceEventArgs.Error + ': ' + $message)
    return
  }
  $position = $session.Position.TotalMilliseconds
  $atEnd = $session.NaturalDuration.TotalMilliseconds - $position -le $END_SLACK_MS
  $ended = $null -ne (Raised $play.events 'ended')
  # Stopped: paused once it has played, or back to None after it started.
  $stopped = ($state -eq 'Paused' -and ($play.started -or $position -gt 0)) -or ($state -eq 'None' -and $play.started)
  if ($ended -or $stopped) {
    if ($ended -or $atEnd) {
      # A sound shorter than one pass is done before it is seen playing: it
      # still started.
      if (-not $play.started) { Send @{ id = $play.id; started = $true } }
      Release $key
      Send @{ id = $play.id; ended = $true }
    } else {
      Interrupted $key 'stopped while speaking' ($state + ' at ' + [int]$position + ' ms')
    }
    return
  }
  if (-not $play.started -and $now - $play.since -gt $START_TIMEOUT_MS) {
    Interrupted $key 'did not start playing' ('still ' + $state + ' after ' + $START_TIMEOUT_MS + ' ms')
  }
}

function Step {
  if ($plays.Count -eq 0) { return $false }
  $now = $clock.ElapsedMilliseconds
  $default = $null
  if ($now - $checked.default -ge $DEFAULT_CHECK_MS) {
    $checked.default = $now
    $default = DefaultOutput
  }
  $presence = $now - $checked.presence -ge $PRESENCE_CHECK_MS
  if ($presence) { $checked.presence = $now }
  foreach ($key in @($plays.Keys)) {
    # A play that throws is cut off alone; out of Step, the error would end
    # the loop and every play with it.
    try {
      Watch $key $now $default $presence
    } catch {
      if ($plays.ContainsKey($key)) {
        Cut $key 'transient' ($plays[$key].named + ' stopped while speaking: ' + $_.Exception.Message) 'an error'
      }
    }
  }
  $plays.Count -gt 0
}

function Receive($request) {
  switch ([string]$request.op) {
    'devices' { Devices $request.id }
    'play' { Play $request }
    'stop' { StopPlay ([string]$request.id) }
    default { Fail $request.id 'unavailable' ('Unknown request ' + $request.op) }
  }
}

Run
