$base = 'http://localhost:3000'
$pass = 0
$fail = 0

function Check($label, $condition) {
    if ($condition) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $label" -ForegroundColor Red
        $script:fail++
    }
}

function Post($url, $body) {
    $json = $body | ConvertTo-Json -Depth 10
    try {
        $r = Invoke-WebRequest -Uri "$base$url" -Method POST -Body $json -ContentType 'application/json' -UseBasicParsing
        return $r.Content | ConvertFrom-Json
    } catch {
        try { return $_.ErrorDetails.Message | ConvertFrom-Json } catch { return @{ error = "HTTP Error" } }
    }
}

function Delete-Api($url) {
    try {
        $r = Invoke-WebRequest -Uri "$base$url" -Method DELETE -UseBasicParsing
        return $r.Content | ConvertFrom-Json
    } catch {
        try { return $_.ErrorDetails.Message | ConvertFrom-Json } catch { return @{ error = "HTTP Error" } }
    }
}

function Get-Api($url) {
    try {
        $r = Invoke-WebRequest -Uri "$base$url" -UseBasicParsing
        return $r.Content | ConvertFrom-Json
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

Write-Host ""
Write-Host "=== OFFLINE EXAM SYSTEM - FULL E2E TEST ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. STUDENT PAGE ──────────────────────────────────────
Write-Host "--- 1. Student Portal Page ---" -ForegroundColor Yellow
$page = (Invoke-WebRequest -Uri $base -UseBasicParsing).Content
Check "Student portal loads (HTTP 200)"        ($page -match 'Student Exam Portal')
Check "First Name field present"               ($page -match 'id="firstName"')
Check "Last Name field present"                ($page -match 'id="lastName"')
Check "Student ID field REMOVED"               ($page -notmatch 'id="studentId"')
Check "Exam Code field present"                ($page -match 'id="examCode"')
Check "Agreement modal present"                ($page -match 'agreementModal')
Check "Anti-cheat warning bar present"         ($page -match 'Do not leave this page')

# ── 2. TEACHER PAGE ──────────────────────────────────────
Write-Host ""
Write-Host "--- 2. Teacher Dashboard Page ---" -ForegroundColor Yellow
$tpage = (Invoke-WebRequest -Uri "$base/teacher" -UseBasicParsing).Content
Check "Teacher dashboard loads"                ($tpage.Length -gt 100)

# ── 3. TEACHER LOGIN ─────────────────────────────────────
Write-Host ""
Write-Host "--- 3. Teacher Authentication ---" -ForegroundColor Yellow
$login = Post '/api/teacher/login' @{ password = 'teacher123' }
Check "Login with correct password succeeds"   ($login.success -eq $true)
$badLogin = Post '/api/teacher/login' @{ password = 'wrongpass' }
Check "Login with wrong password fails"        ($badLogin.error -ne $null)

# ── 4. CREATE EXAM ───────────────────────────────────────
Write-Host ""
Write-Host "--- 4. Create Exam ---" -ForegroundColor Yellow
# First clean up any leftover test exam
$existingExams = Get-Api '/api/exams'
$existingArr = if ($existingExams -is [array]) { $existingExams } elseif ($existingExams.exams) { $existingExams.exams } else { @() }
$leftover = $existingArr | Where-Object { $_.title -eq 'E2E Test Exam' }
if ($leftover) { Delete-Api "/api/exams/$($leftover.id)" | Out-Null }

$examPayload = @{
    title       = 'E2E Test Exam'
    timeLimit   = 30
    maxStudents = 0
    questions   = @(
        @{ type = 'mcq';            question = 'What is 2+2?';       options = @('3','4','5','6'); answer = 'B' },
        @{ type = 'truefalse';      question = 'The sky is blue.';   answer = 'True' },
        @{ type = 'identification'; question = 'Capital of PH?';     answer = 'Manila' }
    )
}
$created = Post '/api/exam/create' $examPayload
Check "Exam created successfully"              ($created.success -eq $true)
$examId = if ($created.exam) { $created.exam.id } else { $null }
Check "Exam has valid ID"                      ($examId -ne $null)

# ── 5. LIST EXAMS ────────────────────────────────────────
Write-Host ""
Write-Host "--- 5. List Exams ---" -ForegroundColor Yellow
$exams = Get-Api '/api/exams'
$examsArr = if ($exams -is [array]) { $exams } elseif ($exams.exams) { $exams.exams } else { @() }
Check "Exam list returns data"                 ($examsArr.Count -gt 0)
$found = $examsArr | Where-Object { $_.title -eq 'E2E Test Exam' }
Check "Created exam appears in list"           ($found -ne $null)
Check "Exam is inactive by default"            ($found.active -eq $false)

# ── 6. START EXAM (toggle) ───────────────────────────────
Write-Host ""
Write-Host "--- 6. Start Exam ---" -ForegroundColor Yellow
$toggled = Post "/api/exams/$examId/toggle" @{}
Check "Exam toggled to active"                 ($toggled.success -eq $true -and $toggled.active -eq $true)

# ── 7. STUDENT ACCESS BY CODE (title) ───────────────────
Write-Host ""
Write-Host "--- 7. Student Access by Exam Code ---" -ForegroundColor Yellow
$encodedTitle = [Uri]::EscapeDataString('E2E Test Exam')
$examByCode = Get-Api "/api/exam/code/$encodedTitle"
Check "Student can fetch exam by title/code"   ($examByCode.id -ne $null)
Check "Exam has questions array"               ($examByCode.questions -ne $null)
Check "Exam has 3 questions"                   ($examByCode.questions.Count -eq 3)
$qJson = $examByCode.questions | ConvertTo-Json -Depth 5
Check "MCQ question present"                   ($qJson -match '"type":\s*"mcq"')
Check "True/False question present"            ($qJson -match '"type":\s*"truefalse"')
Check "Identification question present"        ($qJson -match '"type":\s*"identification"')
if ($examByCode.questions -and $examByCode.questions.Count -gt 0) {
    Check "Answer keys NOT exposed to student" ($examByCode.questions[0].answer -eq $null)
}

# ── 8. STUDENT JOIN ──────────────────────────────────────
Write-Host ""
Write-Host "--- 8. Student Join ---" -ForegroundColor Yellow
$join1 = Post '/api/students/join' @{ studentId = 'dela_cruz_juan_001'; firstName = 'Juan';  lastName = 'Dela Cruz'; examId = $examId }
Check "Student 1 (Dela Cruz) join accepted"    ($join1.success -eq $true)
$join2 = Post '/api/students/join' @{ studentId = 'santos_maria_002';   firstName = 'Maria'; lastName = 'Santos';    examId = $examId }
Check "Student 2 (Santos) join accepted"       ($join2.success -eq $true)
$join3 = Post '/api/students/join' @{ studentId = 'reyes_pedro_003';    firstName = 'Pedro'; lastName = 'Reyes';     examId = $examId }
Check "Student 3 (Reyes) join accepted"        ($join3.success -eq $true)

# ── 9. LIVE STUDENT LIST ─────────────────────────────────
Write-Host ""
Write-Host "--- 9. Live Student Monitor ---" -ForegroundColor Yellow
$live = Get-Api "/api/students/live?examId=$examId"
Check "Live students endpoint works"           ($live -ne $null)
Check "Live students shows joined students"    ($live.Count -ge 1)

# ── 10. STUDENT SUBMISSIONS ──────────────────────────────
Write-Host ""
Write-Host "--- 10. Student Submissions ---" -ForegroundColor Yellow
$sub1 = Post '/api/submit' @{ firstName = 'Juan';  lastName = 'Dela Cruz'; studentId = 'dela_cruz_juan_001'; examId = $examId; answers = @('B','True','Manila'); autoSubmitted = $false; violation = $false }
Check "Student 1 (Dela Cruz) submission accepted"  ($sub1.success -eq $true)

$sub2 = Post '/api/submit' @{ firstName = 'Maria'; lastName = 'Santos';    studentId = 'santos_maria_002';   examId = $examId; answers = @('A','False','Cebu');   autoSubmitted = $false; violation = $false }
Check "Student 2 (Santos) submission accepted"     ($sub2.success -eq $true)

$sub3 = Post '/api/submit' @{ firstName = 'Pedro'; lastName = 'Reyes';     studentId = 'reyes_pedro_003';    examId = $examId; answers = @('B','True','Manila'); autoSubmitted = $true;  violation = $true }
Check "Student 3 (Reyes) violation submission"     ($sub3.success -eq $true)

# Duplicate submission should be rejected
$dup = Post '/api/submit' @{ firstName = 'Juan'; lastName = 'Dela Cruz'; studentId = 'dela_cruz_juan_001'; examId = $examId; answers = @('B','True','Manila'); autoSubmitted = $false; violation = $false }
Check "Duplicate submission rejected"              ($dup.error -ne $null)

# ── 11. RESULTS ──────────────────────────────────────────
Write-Host ""
Write-Host "--- 11. Results & Alphabetical Sort ---" -ForegroundColor Yellow
$results = Get-Api "/api/results?examId=$examId"
$subs = if ($results -is [array]) { $results } elseif ($results.submissions) { $results.submissions } else { @() }
Check "Results endpoint returns submissions"   ($subs.Count -ge 3)

if ($subs.Count -ge 2) {
    $lastNames = $subs | ForEach-Object { $_.lastName }
    $sorted    = $lastNames | Sort-Object
    $isSorted  = ($lastNames[0] -eq $sorted[0])
    Check "Results sorted alphabetically by last name" $isSorted
}

$violator = $subs | Where-Object { $_.lastName -eq 'Reyes' }
Check "Violation flag recorded correctly"      ($violator -ne $null -and $violator.violation -eq $true)

$scorer = $subs | Where-Object { $_.lastName -eq 'Dela Cruz' }
Check "Score calculated for Dela Cruz"         ($scorer -ne $null -and $scorer.score -ne $null)
Check "Dela Cruz scored 3/3 (all correct)"     ($scorer -ne $null -and $scorer.score -eq 3)

$scorer2 = $subs | Where-Object { $_.lastName -eq 'Santos' }
Check "Santos scored 0/3 (all wrong)"          ($scorer2 -ne $null -and $scorer2.score -eq 0)

# ── 12. EXCEL EXPORT ─────────────────────────────────────
Write-Host ""
Write-Host "--- 12. Excel Export ---" -ForegroundColor Yellow
try {
    $xlResp = Invoke-WebRequest -Uri "$base/api/export?examId=$examId" -UseBasicParsing
    Check "Excel export returns HTTP 200"          ($xlResp.StatusCode -eq 200)
    $ct = $xlResp.Headers.'Content-Type'
    Check "Content-Type is Excel/spreadsheet"      ($ct -match 'spreadsheet|excel|octet')
    Check "File has content (non-empty)"           ($xlResp.RawContentLength -gt 100)
} catch {
    Check "Excel export endpoint accessible"       $false
}

# ── 13. STOP EXAM (toggle back) ──────────────────────────
Write-Host ""
Write-Host "--- 13. Stop Exam ---" -ForegroundColor Yellow
$stopped = Post "/api/exams/$examId/toggle" @{}
Check "Exam toggled to inactive"               ($stopped.success -eq $true -and $stopped.active -eq $false)
$examAfterStop = Get-Api "/api/exam/code/$encodedTitle"
Check "Exam not accessible after deactivation" ($examAfterStop.error -ne $null)

# ── 14. CLEANUP ──────────────────────────────────────────
Write-Host ""
Write-Host "--- 14. Cleanup ---" -ForegroundColor Yellow
$deleted = Delete-Api "/api/exams/$examId"
Check "Test exam deleted"                      ($deleted.success -eq $true)
$afterDelete = Get-Api '/api/exams'
$afterArr = if ($afterDelete -is [array]) { $afterDelete } else { @() }
$stillThere = $afterArr | Where-Object { $_.title -eq 'E2E Test Exam' }
Check "Exam no longer in list after delete"    ($stillThere -eq $null)

# ── SUMMARY ──────────────────────────────────────────────
$total = $pass + $fail
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
$color = if ($fail -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "  RESULTS: $pass / $total PASSED  ($fail FAILED)" -ForegroundColor $color
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
