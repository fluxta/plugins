# The `system` Provider's engine on Windows. Windows keeps two voice stores,
# and each is reached the one way that sees it whole: SAPI through COM — the
# only one that sees third-party voices such as RHVoice — and OneCore through
# WinRT, the full Microsoft set (Pavel among them). A request names its store
# and the voice's id there; ids, merging and rates are the sidecar's.

# SAPI voices speak into memory as 22 kHz 16-bit mono (SAFT22kHz16BitMono);
# the stream's own format is what goes back, whatever SAPI made of it.
$SAPI_FORMAT = 22
# SpeechVoiceSpeakFlags.SVSFIsNotXML: the text is read as text, never as
# SAPI XML or SSML, so chat cannot steer the voice.
$SVSF_IS_NOT_XML = 16

$sapi = New-Object -ComObject SAPI.SpVoice

# WinRT reaches Windows PowerShell 5.1 through .NET Framework's projection.
# If it fails, the SAPI voices still speak.
$oneCore = $null
$oneCoreProblem = $null
$asTask = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $oneCore = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
  try {
    # Otherwise ~750 ms of silence follows every Phrase (Windows 10 1803+).
    $oneCore.Options.AppendedSilence = [Windows.Media.SpeechSynthesis.SpeechAppendedSilence]::Min
  } catch {
    [Console]::Error.WriteLine('OneCore keeps its silence after a Phrase: ' + $_.Exception.Message)
  }
} catch {
  $oneCore = $null
  $oneCoreProblem = $_.Exception.Message
  [Console]::Error.WriteLine('The OneCore voices are out of reach: ' + $oneCoreProblem)
}

# A WinRT operation's result, waited for. Its own exception, not
# AggregateException, if it fails.
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}

# The last part of a voice's registry path, for a reason a person reads.
function Leaf([string]$id) {
  ($id -split '\\')[-1]
}

function SapiName($token) {
  $name = ''
  try { $name = [string]$token.GetAttribute('Name') } catch {}
  if (-not $name) { $name = [string]$token.GetDescription() }
  $name
}

# SAPI writes a voice's language as hexadecimal LCIDs: 419 is ru-RU.
function SapiLanguage($token) {
  try {
    $lcid = ([string]$token.GetAttribute('Language')).Split(';')[0]
    return [System.Globalization.CultureInfo]::GetCultureInfo([Convert]::ToInt32($lcid, 16)).Name
  } catch {
    return ''
  }
}

function Voices($id) {
  $problems = New-Object System.Collections.ArrayList

  $sapiVoices = New-Object System.Collections.ArrayList
  $sapiDefault = ''
  try {
    foreach ($token in $sapi.GetVoices()) {
      $null = $sapiVoices.Add(@{ id = [string]$token.Id; name = (SapiName $token); language = (SapiLanguage $token) })
    }
    # A fresh SpVoice starts with the voice chosen in Control Panel.
    $sapiDefault = [string](New-Object -ComObject SAPI.SpVoice).Voice.Id
  } catch {
    $null = $problems.Add('SAPI: ' + $_.Exception.Message)
  }

  $oneCoreVoices = New-Object System.Collections.ArrayList
  $oneCoreDefault = ''
  if ($null -eq $oneCore) {
    $null = $problems.Add('OneCore: ' + $oneCoreProblem)
  } else {
    try {
      foreach ($voice in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
        $null = $oneCoreVoices.Add(@{ id = [string]$voice.Id; name = [string]$voice.DisplayName; language = [string]$voice.Language })
      }
      # The voice chosen in Settings, under Time & language > Speech.
      $oneCoreDefault = [string][Windows.Media.SpeechSynthesis.SpeechSynthesizer]::DefaultVoice.Id
    } catch {
      $null = $problems.Add('OneCore: ' + $_.Exception.Message)
    }
  }

  Send @{ id = $id; sapi = $sapiVoices; sapiDefault = $sapiDefault; oneCore = $oneCoreVoices; oneCoreDefault = $oneCoreDefault; problems = $problems }
}

function SynthesizeSapi($request) {
  $token = $null
  foreach ($candidate in $sapi.GetVoices()) {
    if ([string]$candidate.Id -eq [string]$request.voice) { $token = $candidate; break }
  }
  if ($null -eq $token) {
    Fail $request.id 'voice-missing' ('No voice ' + (Leaf $request.voice) + ' on this computer')
    return
  }
  $format = New-Object -ComObject SAPI.SpAudioFormat
  $format.Type = $SAPI_FORMAT
  $memory = New-Object -ComObject SAPI.SpMemoryStream
  $memory.Format = $format
  $sapi.Voice = $token
  $sapi.Rate = [int]$request.rate
  $sapi.Volume = 100
  $sapi.AllowAudioOutputFormatChangesOnNextSet = $false
  $sapi.AudioOutputStream = $memory
  $null = $sapi.Speak([string]$request.text, $SVSF_IS_NOT_XML)
  [byte[]]$bytes = $memory.GetData()
  $wave = $memory.Format.GetWaveFormatEx()
  SendAudio $request.id 'pcm' $bytes (',"sampleRate":' + $wave.SamplesPerSec + ',"channels":' + $wave.Channels + ',"bits":' + $wave.BitsPerSample)
}

function SynthesizeOneCore($request) {
  if ($null -eq $oneCore) {
    Fail $request.id 'unavailable' ('The OneCore voices are out of reach: ' + $oneCoreProblem)
    return
  }
  $voice = $null
  foreach ($candidate in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
    if ([string]$candidate.Id -eq [string]$request.voice) { $voice = $candidate; break }
  }
  if ($null -eq $voice) {
    Fail $request.id 'voice-missing' ('No voice ' + (Leaf $request.voice) + ' on this computer')
    return
  }
  $oneCore.Voice = $voice
  $oneCore.Options.SpeakingRate = [double]$request.rate
  # The plain-text call: nothing in the text is read as SSML, so neither a
  # <break time="60s"/> nor a stray < or & from chat changes what is said.
  $stream = Await ($oneCore.SynthesizeTextToStreamAsync([string]$request.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  try {
    $size = [uint32]$stream.Size
    $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    $null = Await ($reader.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
  } finally {
    $stream.Dispose()
  }
  SendAudio $request.id 'wav' $bytes ''
}

function Receive($request) {
  switch ([string]$request.op) {
    'voices' { Voices $request.id }
    'synthesize' {
      if ($request.store -eq 'sapi') { SynthesizeSapi $request }
      elseif ($request.store -eq 'onecore') { SynthesizeOneCore $request }
      else { Fail $request.id 'voice-missing' ('No voice store ' + $request.store + ' on this computer') }
    }
    # A synthesis runs to its end once begun; the sidecar has stopped
    # listening for it.
    'cancel' {}
    default { Fail $request.id 'unavailable' ('Unknown request ' + $request.op) }
  }
}

function Step { $false }

Run
