$lines = [System.IO.File]::ReadAllLines("script.js")
$part1 = $lines[0..1907]
$part2 = [System.IO.File]::ReadAllLines("full_dictionaries.txt")
# Find stripPinyinTones
$offset = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -like "*function stripPinyinTones*") {
        $offset = $i
        break
    }
}
$part3 = $lines[$offset..($lines.Length-1)]
$final = $part1 + $part2 + $part3
[System.IO.File]::WriteAllLines("script.js", $final)
