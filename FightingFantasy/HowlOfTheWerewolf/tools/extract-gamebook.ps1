param(
    [string]$PdfPath = "source\altered FF61 Howl of the Werewolf.pdf",
    [string]$OutDir = "playable"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$iso = [System.Text.Encoding]::GetEncoding("iso-8859-1")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Web

function ConvertFrom-PdfHex {
    param([string]$Hex)

    $clean = ($Hex -replace "\s", "")
    if ($clean.Length % 2 -eq 1) {
        $clean = "$clean" + "0"
    }

    $bytes = New-Object byte[] ($clean.Length / 2)
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        $bytes[$i] = [Convert]::ToByte($clean.Substring($i * 2, 2), 16)
    }

    return $iso.GetString($bytes)
}

function Expand-FlateStream {
    param([byte[]]$Bytes)

    foreach ($skip in 2, 0) {
        try {
            $input = New-Object System.IO.MemoryStream
            $input.Write($Bytes, $skip, $Bytes.Length - $skip)
            $input.Position = 0

            $inflate = New-Object System.IO.Compression.DeflateStream(
                $input,
                [System.IO.Compression.CompressionMode]::Decompress
            )

            $output = New-Object System.IO.MemoryStream
            $buffer = New-Object byte[] 8192
            while (($read = $inflate.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $output.Write($buffer, 0, $read)
            }
            $inflate.Dispose()

            if ($output.Length -gt 0) {
                return $iso.GetString($output.ToArray())
            }
        } catch {
            # Try the next framing style. PDF Flate streams usually have a zlib header.
        }
    }

    return ""
}

function ConvertTo-JsString {
    param([string]$Value)

    return [System.Web.HttpUtility]::JavaScriptStringEncode($Value)
}

function Get-PdfObjects {
    param([string]$PdfText)

    $objects = @{}
    $objectRegex = [regex]'(?s)(\d+)\s+(\d+)\s+obj\s*(.*?)\s*endobj'
    foreach ($match in $objectRegex.Matches($PdfText)) {
        $id = [int]$match.Groups[1].Value
        $raw = $match.Groups[3].Value
        $streamBytes = $null
        $dict = $raw

        $streamIndex = $raw.IndexOf("stream")
        if ($streamIndex -ge 0) {
            $dict = $raw.Substring(0, $streamIndex)
            $streamStart = $streamIndex + "stream".Length
            if ($streamStart -lt $raw.Length -and $raw[$streamStart] -eq "`r") { $streamStart++ }
            if ($streamStart -lt $raw.Length -and $raw[$streamStart] -eq "`n") { $streamStart++ }

            $streamEnd = $raw.LastIndexOf("endstream")
            if ($streamEnd -gt $streamStart) {
                $streamText = $raw.Substring($streamStart, $streamEnd - $streamStart)
                if ($streamText.EndsWith("`r`n")) {
                    $streamText = $streamText.Substring(0, $streamText.Length - 2)
                } elseif ($streamText.EndsWith("`n")) {
                    $streamText = $streamText.Substring(0, $streamText.Length - 1)
                }
                $streamBytes = $iso.GetBytes($streamText)
            }
        }

        $objects[$id] = [pscustomobject]@{
            Id = $id
            Raw = $raw
            Dictionary = $dict
            StreamBytes = $streamBytes
        }
    }

    return $objects
}

function Get-PageOrder {
    param($Objects)

    $catalog = $Objects.Values | Where-Object { $_.Dictionary -match "/Type\s*/Catalog" } | Select-Object -First 1
    if (-not $catalog -or $catalog.Dictionary -notmatch "/Pages\s+(\d+)\s+0\s+R") {
        throw "Could not find PDF catalog page tree."
    }

    $rootPagesId = [int]$Matches[1]
    $order = New-Object System.Collections.Generic.List[int]

    function Visit-PageNode {
        param([int]$ObjectId)

        $node = $Objects[$ObjectId]
        if (-not $node) { return }

        if ($node.Dictionary -match "/Type\s*/Page\b") {
            $order.Add($ObjectId)
            return
        }

        $kidsMatch = [regex]::Match($node.Dictionary, '(?s)/Kids\s*\[(.*?)\]')
        if (-not $kidsMatch.Success) { return }

        foreach ($kidMatch in [regex]::Matches($kidsMatch.Groups[1].Value, '(\d+)\s+0\s+R')) {
            Visit-PageNode ([int]$kidMatch.Groups[1].Value)
        }
    }

    Visit-PageNode $rootPagesId
    return $order
}

function Get-ContentIds {
    param([string]$PageDictionary)

    $ids = New-Object System.Collections.Generic.List[int]
    $arrayMatch = [regex]::Match($PageDictionary, '(?s)/Contents\s*\[(.*?)\]')
    if ($arrayMatch.Success) {
        foreach ($idMatch in [regex]::Matches($arrayMatch.Groups[1].Value, '(\d+)\s+0\s+R')) {
            $ids.Add([int]$idMatch.Groups[1].Value)
        }
        return $ids
    }

    $singleMatch = [regex]::Match($PageDictionary, '/Contents\s+(\d+)\s+0\s+R')
    if ($singleMatch.Success) {
        $ids.Add([int]$singleMatch.Groups[1].Value)
    }

    return $ids
}

function Get-TextItems {
    param([string]$Content)

    $items = New-Object System.Collections.Generic.List[object]
    $x = 0.0
    $y = 0.0

    foreach ($line in ($Content -split "`r?`n")) {
        $tm = [regex]::Match($line, '^\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+Tm\s*$')
        if ($tm.Success) {
            $x = [double]$tm.Groups[1].Value
            $y = [double]$tm.Groups[2].Value
            continue
        }

        $tj = [regex]::Match($line, '^\s*<([0-9A-Fa-f\s]+)>\s*Tj\s*$')
        if ($tj.Success) {
            $value = ConvertFrom-PdfHex $tj.Groups[1].Value
            if ($value.Trim().Length -gt 0) {
                $items.Add([pscustomobject]@{
                    X = $x
                    Y = $y
                    Text = $value
                })
            }
        }
    }

    return $items
}

function Get-PageText {
    param($Items)

    if ($Items.Count -eq 0) { return "" }

    $columns = @(
        @{ Name = "left"; Min = -99999.0; Max = 305.0 },
        @{ Name = "right"; Min = 305.0; Max = 99999.0 }
    )

    $pageLines = New-Object System.Collections.Generic.List[string]

    foreach ($column in $columns) {
        $columnItems = @($Items | Where-Object { $_.X -ge $column.Min -and $_.X -lt $column.Max })
        if ($columnItems.Count -eq 0) { continue }

        $lineGroups = @{}
        foreach ($item in $columnItems) {
            $key = [int][Math]::Round($item.Y / 2.0)
            if (-not $lineGroups.ContainsKey($key)) {
                $lineGroups[$key] = New-Object System.Collections.Generic.List[object]
            }
            $lineGroups[$key].Add($item)
        }

        $sortedKeys = @($lineGroups.Keys | Sort-Object { [int]$_ } -Descending)
        foreach ($key in $sortedKeys) {
            $lineText = (($lineGroups[$key] | Sort-Object X | ForEach-Object { $_.Text }) -join "")
            $lineText = ($lineText -replace "\s+", " ").Trim()
            if ($lineText.Length -gt 0) {
                $pageLines.Add($lineText)
            }
        }
    }

    return ($pageLines -join "`n")
}

function Repair-ExtractedText {
    param([string]$Text)

    $value = $Text
    $value = $value.Replace([string][char]0x00A0, " ")
    $value = $value.Replace([string][char]0xFB01, "fi")
    $value = $value.Replace([string][char]0xFB02, "fl")
    $value = $value.Replace([string][char]0x2019, "'")
    $value = $value.Replace([string][char]0x2018, "'")
    $value = $value.Replace([string][char]0x201C, '"')
    $value = $value.Replace([string][char]0x201D, '"')
    $value = $value.Replace([string][char]0x2014, "-")
    $value = $value.Replace([string][char]0x2013, "-")

    $value = $value -replace "\s+`n", "`n"
    $value = $value -replace "`n\s+", "`n"
    $value = $value -replace "`n{3,}", "`n`n"
    return $value.Trim()
}

function Get-OcrDigitOptions {
    param([char]$Char)

    switch -Regex ([string]$Char) {
        '^[0]$' { return @("0") }
        '^[1]$' { return @("1") }
        '^[2]$' { return @("2") }
        '^[3]$' { return @("3") }
        '^[4]$' { return @("4") }
        '^[5]$' { return @("5") }
        '^[6]$' { return @("6") }
        '^[7]$' { return @("7", "1") }
        '^[8]$' { return @("8") }
        '^[9]$' { return @("9") }
        '^[oO\(\)]$' { return @("0") }
        '^[aAlIiItT\|!]$' { return @("1") }
        '^[zZ]$' { return @("2") }
        '^[jJ]$' { return @("3", "5") }
        '^[sS]$' { return @("5") }
        '^[bG]$' { return @("6") }
        '^[eEB]$' { return @("8") }
        '^[qg]$' { return @("9") }
        default { return @() }
    }
}

function Test-OcrTokenMatchesNumber {
    param(
        [string]$Token,
        [int]$Number
    )

    $target = [string]$Number
    $clean = ($Token -replace "\s+", "").Trim(" `t`r`n.,:;`'`"{}[]")
    if ($clean.Length -lt 1 -or $clean.Length -gt ($target.Length + 2)) {
        return $false
    }
    if ($clean -match "-") {
        return $false
    }

    $states = @("")
    foreach ($ch in $clean.ToCharArray()) {
        $options = @(Get-OcrDigitOptions $ch)
        if ($options.Count -eq 0) {
            return $false
        }

        $next = New-Object System.Collections.Generic.List[string]
        foreach ($state in $states) {
            foreach ($option in $options) {
                $candidate = "$state$option"
                if ($candidate.Length -le ($target.Length + 1)) {
                    $next.Add($candidate)
                }
            }
        }
        $states = @($next | Select-Object -Unique)
    }

    foreach ($state in $states) {
        if ($state -eq $target) {
            return $true
        }

        # Some OCR tokens double-draw a zero-like glyph, for example "1(}" for "10".
        $squashed = $state -replace "00+", "0"
        if ($squashed -eq $target) {
            return $true
        }
    }

    return $false
}

function ConvertFrom-OcrNumberToken {
    param([string]$Token)

    $clean = ($Token -replace "\s+", "").Trim(" `t`r`n.,:;`'`"{}[]")
    if ($clean.Length -lt 1 -or $clean.Length -gt 4) {
        return $null
    }

    $digits = New-Object System.Text.StringBuilder
    foreach ($ch in $clean.ToCharArray()) {
        $digit = $null
        switch -Regex ([string]$ch) {
            '^[0-9]$' { $digit = [string]$ch; break }
            '^[oO\(\)]$' { $digit = "0"; break }
            '^[aAlIiItT\|!]$' { $digit = "1"; break }
            '^[zZ]$' { $digit = "2"; break }
            '^[jJ]$' { $digit = "3"; break }
            '^[sS]$' { $digit = "5"; break }
            '^[bG]$' { $digit = "6"; break }
            '^[eEB]$' { $digit = "8"; break }
            '^[qg]$' { $digit = "9"; break }
            default { $digit = $null; break }
        }

        if ($null -ne $digit) {
            [void]$digits.Append($digit)
        }
    }

    $value = $digits.ToString() -replace "00+", "0"
    if ($value.Length -lt 1 -or $value.Length -gt 3) {
        return $null
    }

    $number = [int]$value
    if ($number -lt 1 -or $number -gt 515) {
        return $null
    }

    return $number
}

function Test-PageRangeLine {
    param([string]$Line)

    $trimmed = $Line.Trim()
    if ($trimmed -notmatch '^([0-9A-Za-z\(\)\{\}''",.]+)\s*-\s*([0-9A-Za-z\(\)\{\}''",.]+)$') {
        return $false
    }

    $first = ConvertFrom-OcrNumberToken $Matches[1]
    $second = ConvertFrom-OcrNumberToken $Matches[2]
    if ($null -eq $first -or $null -eq $second) {
        return $false
    }

    return ([Math]::Abs($first - $second) -le 8)
}

function Test-ChoiceEndingLine {
    param(
        [string[]]$Lines,
        [int]$Index
    )

    $line = $Lines[$Index]
    $previous = ""
    if ($Index -gt 0) {
        $previous = $Lines[$Index - 1]
    }
    $next = ""
    if ($Index + 1 -lt $Lines.Count) {
        $next = $Lines[$Index + 1]
    }

    $hasTurn = ($line -match '(?i)\b(tu?rn|tum|tuin|tuln|furn|fum|hrm|rurn)\s+to\b')
    $isTargetAfterTurn = (($line.Trim().Length -le 5) -and ($previous -match '(?i)\b(tu?rn|tum|tuin|tuln|furn|fum|hrm|rurn)\s+to\s*$') -and ($null -ne (ConvertFrom-OcrNumberToken $line)))
    $nextLooksLikeText = ($next -match '^[A-Z''"]|^(You|The|As|If|Roll|Do|In|After|Before|Having|Suddenly|There|This|With|Lothar|Katarina|Count)\b')

    return (($hasTurn -or $isTargetAfterTurn) -and $nextLooksLikeText)
}

function Find-SectionBoundary {
    param([string[]]$Lines)

    if ($Lines.Count -lt 4) {
        return -1
    }

    for ($i = 1; $i -lt ($Lines.Count - 1); $i++) {
        if (Test-ChoiceEndingLine $Lines $i) {
            return ($i + 1)
        }
    }

    return -1
}

function Add-ExtractedSection {
    param(
        [System.Collections.Generic.List[object]]$Sections,
        [int]$Number,
        [int]$Page,
        [string[]]$Lines
    )

    $text = Repair-ExtractedText (($Lines | Where-Object { $_.Trim().Length -gt 0 }) -join "`n")
    $Sections.Add([pscustomobject]@{
        Number = $Number
        Page = $Page
        Text = $text
    })
}

function Add-SectionRun {
    param(
        [System.Collections.Generic.List[object]]$Sections,
        [int]$StartNumber,
        [int]$EndNumber,
        [int]$Page,
        [string[]]$Lines
    )

    if ($StartNumber -gt $EndNumber) {
        return
    }

    $remaining = @($Lines)
    for ($number = $StartNumber; $number -le $EndNumber; $number++) {
        if ($number -eq $EndNumber) {
            Add-ExtractedSection $Sections $number $Page $remaining
            return
        }

        $boundary = Find-SectionBoundary $remaining
        if ($boundary -le 0 -or $boundary -ge $remaining.Count) {
            Add-ExtractedSection $Sections $number $Page $remaining
            for ($missing = $number + 1; $missing -le $EndNumber; $missing++) {
                Add-ExtractedSection $Sections $missing $Page @()
            }
            return
        }

        Add-ExtractedSection $Sections $number $Page @($remaining[0..($boundary - 1)])
        $remaining = @($remaining[$boundary..($remaining.Count - 1)])
    }
}

function Split-Sections {
    param([string[]]$PageTexts)

    $combinedLines = New-Object System.Collections.Generic.List[object]
    $inAdventure = $false
    for ($pageIndex = 0; $pageIndex -lt $PageTexts.Count; $pageIndex++) {
        foreach ($line in ($PageTexts[$pageIndex] -split "`n")) {
            $clean = Repair-ExtractedText $line
            if ($clean -match '(?i)Now\s+\w+\s+to\s+para') {
                $inAdventure = $true
                continue
            }
            if (-not $inAdventure) {
                continue
            }
            if ($clean.Length -gt 0) {
                $combinedLines.Add([pscustomobject]@{
                    Page = $pageIndex + 1
                    Text = $clean
                })
            }
        }
    }

    $sections = New-Object System.Collections.Generic.List[object]
    $current = $null
    $currentLines = New-Object System.Collections.Generic.List[string]
    $nextNumber = 1

    foreach ($line in $combinedLines) {
        if (Test-PageRangeLine $line.Text) {
            continue
        }

        $matchedNumber = $null
        if (Test-OcrTokenMatchesNumber $line.Text $nextNumber) {
            $matchedNumber = $nextNumber
        } else {
            for ($future = $nextNumber + 1; $future -le ([Math]::Min(515, $nextNumber + 10)); $future++) {
                if (Test-OcrTokenMatchesNumber $line.Text $future) {
                    $matchedNumber = $future
                    break
                }
            }
        }

        if ($null -ne $matchedNumber) {
            if ($current -ne $null) {
                Add-SectionRun $sections $current.Number ($matchedNumber - 1) $current.Page @($currentLines)
            }

            $current = [pscustomobject]@{
                Number = $matchedNumber
                Page = $line.Page
            }
            $currentLines = New-Object System.Collections.Generic.List[string]
            $nextNumber = $matchedNumber + 1
            continue
        }

        if ($current -ne $null) {
            $currentLines.Add($line.Text)
        }
    }

    if ($current -ne $null) {
        Add-SectionRun $sections $current.Number 515 $current.Page @($currentLines)
    }

    $seen = @{}
    $deduped = New-Object System.Collections.Generic.List[object]
    foreach ($section in ($sections | Sort-Object Number, Page)) {
        if (-not $seen.ContainsKey($section.Number)) {
            $seen[$section.Number] = $true
            $deduped.Add($section)
        }
    }

    return $deduped
}

function Get-Choices {
    param(
        [string]$Text,
        [int]$CurrentNumber
    )

    $choices = New-Object System.Collections.Generic.List[int]
    $patterns = @(
        '(?i)\bturn\s+to\s+(?:paragraph\s+)?(\d{1,3})\b',
        '(?i)\bgo\s+to\s+(?:paragraph\s+)?(\d{1,3})\b',
        '(?i)\bturn\s+to\s+(\d{1,3})\b',
        '(?i)\bgo\s+on\s+to\s+(\d{1,3})\b',
        '(?i)\bcontinue\s+at\s+(\d{1,3})\b',
        '(?i)\bsection\s+(\d{1,3})\b',
        '(?i)\bparagraph\s+(\d{1,3})\b'
    )

    foreach ($pattern in $patterns) {
        foreach ($match in [regex]::Matches($Text, $pattern)) {
            $number = [int]$match.Groups[1].Value
            if ($number -ge 1 -and $number -le 515 -and $number -ne $CurrentNumber -and -not $choices.Contains($number)) {
                $choices.Add($number)
            }
        }
    }

    return @($choices | Sort-Object)
}

$pdfFullPath = Resolve-Path $PdfPath
$pdfBytes = [System.IO.File]::ReadAllBytes($pdfFullPath)
$pdfText = $iso.GetString($pdfBytes)
$objects = Get-PdfObjects $pdfText
$pageOrder = Get-PageOrder $objects
$pageTexts = New-Object System.Collections.Generic.List[string]

foreach ($pageObjectId in $pageOrder) {
    $page = $objects[$pageObjectId]
    $items = New-Object System.Collections.Generic.List[object]
    foreach ($contentId in (Get-ContentIds $page.Dictionary)) {
        $contentObject = $objects[$contentId]
        if (-not $contentObject -or -not $contentObject.StreamBytes) { continue }
        if ($contentObject.Dictionary -notmatch "/FlateDecode") { continue }

        $content = Expand-FlateStream $contentObject.StreamBytes
        if ($content -notmatch "\bTj\b") { continue }

        foreach ($item in (Get-TextItems $content)) {
            $items.Add($item)
        }
    }

    $pageTexts.Add((Get-PageText $items))
}

$sections = Split-Sections @($pageTexts)
$sectionByNumber = @{}
foreach ($section in $sections) {
    $sectionByNumber[$section.Number] = $section
}

$outPath = Join-Path $OutDir "book-data.js"
$pagePath = Join-Path $OutDir "pages.txt"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$js = New-Object System.Text.StringBuilder
[void]$js.AppendLine("window.GAMEBOOK_DATA = {")
[void]$js.AppendLine("  title: `"Howl of the Werewolf`",")
[void]$js.AppendLine("  sourcePdf: `"../source/altered FF61 Howl of the Werewolf.pdf`",")
[void]$js.AppendLine("  coverImage: `"../source/howlofthewerewolf.jpg`",")
[void]$js.AppendLine("  generatedAt: `"$((Get-Date).ToString("s"))`",")
[void]$js.AppendLine("  note: `"Text was extracted from the PDF OCR layer and may contain OCR errors.`",")
[void]$js.AppendLine("  sections: {")

$sectionLines = New-Object System.Collections.Generic.List[string]
foreach ($section in ($sections | Sort-Object Number)) {
    $choices = Get-Choices $section.Text $section.Number
    $choiceJs = ($choices | ForEach-Object { [string]$_ }) -join ", "
    $textJs = ConvertTo-JsString $section.Text
    $line = "    `"$($section.Number)`": { number: $($section.Number), page: $($section.Page), choices: [$choiceJs], text: `"$textJs`" }"
    $sectionLines.Add($line)
}
[void]$js.AppendLine(($sectionLines -join ",`n"))
[void]$js.AppendLine("  }")
[void]$js.AppendLine("};")

[System.IO.File]::WriteAllText((Join-Path (Resolve-Path $OutDir) "book-data.js"), $js.ToString(), $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path (Resolve-Path $OutDir) "pages.txt"), (($pageTexts | ForEach-Object { Repair-ExtractedText $_ }) -join "`n`n--- PAGE BREAK ---`n`n"), $utf8NoBom)

$choiceCount = 0
foreach ($section in $sections) {
    $choiceCount += @((Get-Choices $section.Text $section.Number)).Count
}

Write-Output "Pages: $($pageTexts.Count)"
Write-Output "Sections: $($sections.Count)"
Write-Output "Detected choices: $choiceCount"
Write-Output "Data: $outPath"
Write-Output "Raw extracted pages: $pagePath"
