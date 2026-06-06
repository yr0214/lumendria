$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$s = Get-Content ..\scenario_v3.json -Raw | ConvertFrom-Json
$missing = @()
foreach($prop in $s.nodes.PSObject.Properties){
  $key = $prop.Name
  $node = $prop.Value
  if($null -eq $node.images){ continue }
  $imgs = $node.images
  if($imgs -is [System.Array]){
    foreach($img in $imgs){
      if($img -match '^[0-9]+$'){
        $fn = Join-Path ..\images "$key-$img.png"
        if(-not (Test-Path $fn)) { $missing += $fn }
      } else {
        $name = [System.IO.Path]::GetFileName($img)
        $fn = Join-Path ..\images $name
        if(-not (Test-Path $fn)) { $missing += $fn }
      }
    }
  } else {
    $img = $imgs
    if($img -match '^[0-9]+$'){
      $fn = Join-Path ..\images "$key-$img.png"
      if(-not (Test-Path $fn)) { $missing += $fn }
    } else {
      $name = [System.IO.Path]::GetFileName($img)
      $fn = Join-Path ..\images $name
      if(-not (Test-Path $fn)) { $missing += $fn }
    }
  }
}
$missing | Sort-Object -Unique | ForEach-Object { Write-Output $_ }
