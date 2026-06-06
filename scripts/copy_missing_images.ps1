$src = 'C:\Users\User\Downloads\lunmandria'
$dst = 'C:\Users\User\Desktop\lumendria\images'
$names = @('cave-2.png','forest-2.png','ruins-2.png','ruins-3.png','start-1.svg','throne-1.png','throne-2.png')
foreach($n in $names){
  $s = Join-Path $src $n
  if(Test-Path $s){
    Copy-Item $s -Destination $dst -Force
    Write-Host "COPIED: $n"
  } else {
    Write-Host "NOT FOUND: $n"
  }
}
