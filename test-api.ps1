$base = "http://localhost:3000"
$pass = $true

function Test($name, $result, $expect) {
    if ($result -match $expect) {
        Write-Host "  [PASS] $name" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $name => $result" -ForegroundColor Red
        $script:pass = $false
    }
}

Write-Host "`n=== OFFLINE EXAM SYSTEM - API TESTS ===" -ForegroundColor Cyan

# ── TEST 1: Teacher login correct password ──
Write-Host "`n[1] Teacher Login" -ForegroundColor Yellow
$body = '{"password":"teacher123"}'
try {
    $r = Invoke-RestMethod -Uri "$base/api/teacher/login" -Method POST -ContentType "application/json" -Body $body
    Test "Correct password accepted" ($r.success) "True"
} catch { Write-Host "  [FAIL] Login error: $_" -ForegroundColor Red }

# ── TEST 2: Teacher login wrong password ──
$body2 = '{"password":"wrongpass"}'
try {
    $r2 = Invoke-RestMethod -Uri "$base/api/teacher/login" -Method POST -ContentType "application/json" -Body $body2 -ErrorAction SilentlyContinue
    Write-Host "  [FAIL] Wrong password should be rejected" -ForegroundColor Red
} catch {
    Test "Wrong password rejected (401)" $_.Exception.Message "401|Unauthorized|error"
}

# ── TEST 3: Create exam with all question types ──
Write-Host "`n[2] Create Exam" -ForegroundColor Yellow
$examBody = @"
{
  "title": "TEST-EXAM-API",
  "timeLimit": 30,
  "maxStudents": 5,
  "questions": [
    {"type":"mcq","question":"What is 2+2?","answer":"B","options":["1","4","3","5"]},
    {"type":"truefalse","question":"The sky is blue.","answer":"True","options":null},
    {"type":"identification","question":"Capital of Philippines?","answer":"Manila","options":null}
  ]
}
"@
try {
    $r3 = Invoke-RestMethod -Uri "$base/api/exam/create" -Method POST -ContentType "application/json" -Body $examBody
    Test "Exam created successfully" ($r3.success) "True"
    $examId = $r3.exam.id
    Write-Host "  Exam ID: $examId" -ForegroundColor Gray
} catch { Write-Host "  [FAIL] Create exam: $_" -ForegroundColor Red; $examId = $null }

# ── TEST 4: Get all exams ──
Write-Host "`n[3] Get Exams List" -ForegroundColor Yellow
try {
    $exams = Invoke-RestMethod -Uri "$base/api/exams" -Method GET
    Test "Exams list returned" ($exams.Count -ge 1) "True"
    $testExam = $exams | Where-Object { $_.title -eq "TEST-EXAM-API" }
    Test "Test exam found in list" ($testExam -ne $null) "True"
    Test "maxStudents set correctly" ($testExam.maxStudents -eq 5) "True"
} catch { Write-Host "  [FAIL] Get exams: $_" -ForegroundColor Red }

# ── TEST 5: Activate exam ──
Write-Host "`n[4] Activate Exam" -ForegroundColor Yellow
if ($examId) {
    try {
        $r5 = Invoke-RestMethod -Uri "$base/api/exams/$examId/toggle" -Method POST
        Test "Exam activated" ($r5.active) "True"
    } catch { Write-Host "  [FAIL] Toggle: $_" -ForegroundColor Red }
}

# ── TEST 6: Student get exam by code ──
Write-Host "`n[5] Student Get Exam by Code" -ForegroundColor Yellow
try {
    $r6 = Invoke-RestMethod -Uri "$base/api/exam/code/TEST-EXAM-API" -Method GET
    Test "Exam found by code" ($r6.title) "TEST-EXAM-API"
    Test "Has 3 questions" ($r6.totalQuestions -eq 3) "True"
    Test "maxStudents=5" ($r6.maxStudents -eq 5) "True"
    Test "remainingSlots=5" ($r6.remainingSlots -eq 5) "True"
} catch { Write-Host "  [FAIL] Get by code: $_" -ForegroundColor Red }

# ── TEST 7: Student join exam ──
Write-Host "`n[6] Student Join Exam" -ForegroundColor Yellow
if ($examId) {
    $joinBody = "{`"studentId`":`"2024-001`",`"firstName`":`"Juan`",`"lastName`":`"Dela Cruz`",`"examId`":`"$examId`"}"
    try {
        $r7 = Invoke-RestMethod -Uri "$base/api/students/join" -Method POST -ContentType "application/json" -Body $joinBody
        Test "Student joined successfully" ($r7.success) "True"
    } catch { Write-Host "  [FAIL] Join: $_" -ForegroundColor Red }
}

# ── TEST 8: Student submit exam ──
Write-Host "`n[7] Student Submit Exam" -ForegroundColor Yellow
if ($examId) {
    $submitBody = "{`"firstName`":`"Juan`",`"lastName`":`"Dela Cruz`",`"studentId`":`"2024-001`",`"examId`":`"$examId`",`"answers`":[`"B`",`"True`",`"Manila`"],`"autoSubmitted`":false,`"violation`":false}"
    try {
        $r8 = Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType "application/json" -Body $submitBody
        Test "Submission accepted" ($r8.success) "True"
    } catch { Write-Host "  [FAIL] Submit: $_" -ForegroundColor Red }
}

# ── TEST 9: Duplicate submission blocked ──
Write-Host "`n[8] Duplicate Submission Prevention" -ForegroundColor Yellow
if ($examId) {
    $submitBody2 = "{`"firstName`":`"Juan`",`"lastName`":`"Dela Cruz`",`"studentId`":`"2024-001`",`"examId`":`"$examId`",`"answers`":[`"B`",`"True`",`"Manila`"],`"autoSubmitted`":false,`"violation`":false}"
    try {
        $r9 = Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType "application/json" -Body $submitBody2 -ErrorAction SilentlyContinue
        Write-Host "  [FAIL] Duplicate should be rejected" -ForegroundColor Red
    } catch {
        Test "Duplicate submission rejected (400)" $_.Exception.Message "400|already submitted"
    }
}

# ── TEST 10: Submit with violation flag ──
Write-Host "`n[9] Violation Flag Submission" -ForegroundColor Yellow
if ($examId) {
    $violBody = "{`"firstName`":`"Maria`",`"lastName`":`"Santos`",`"studentId`":`"2024-002`",`"examId`":`"$examId`",`"answers`":[`"A`",`"False`",`"Cebu`"],`"autoSubmitted`":true,`"violation`":true}"
    try {
        $r10 = Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType "application/json" -Body $violBody
        Test "Violation submission accepted" ($r10.success) "True"
    } catch { Write-Host "  [FAIL] Violation submit: $_" -ForegroundColor Red }
}

# ── TEST 11: Get results (sorted by last name) ──
Write-Host "`n[10] Results - Sorted by Last Name" -ForegroundColor Yellow
try {
    $results = Invoke-RestMethod -Uri "$base/api/results" -Method GET
    $testResults = $results | Where-Object { $_.examId -eq $examId }
    Test "Results returned" ($testResults.Count -ge 2) "True"
    if ($testResults.Count -ge 2) {
        $first = $testResults[0].lastName
        $second = $testResults[1].lastName
        Test "Sorted alphabetically (Dela Cruz before Santos)" ($first -le $second) "True"
        $violEntry = $testResults | Where-Object { $_.studentId -eq "2024-002" }
        Test "Violation flag stored correctly" ($violEntry.violation) "True"
        $normalEntry = $testResults | Where-Object { $_.studentId -eq "2024-001" }
        Test "Normal submission has violation=false" (-not $normalEntry.violation) "True"
        Test "Score graded correctly (3/3 for Juan)" ($normalEntry.score -eq 3) "True"
        Test "Score graded correctly (0/3 for Maria)" ($violEntry.score -eq 0) "True"
    }
} catch { Write-Host "  [FAIL] Results: $_" -ForegroundColor Red }

# ── TEST 12: Student limit enforcement ──
Write-Host "`n[11] Student Limit Enforcement" -ForegroundColor Yellow
if ($examId) {
    # Submit 3 more students to fill up (limit=5, already have 2)
    for ($i = 3; $i -le 5; $i++) {
        $b = "{`"firstName`":`"Student$i`",`"lastName`":`"Test$i`",`"studentId`":`"2024-00$i`",`"examId`":`"$examId`",`"answers`":[`"B`",`"True`",`"Manila`"],`"autoSubmitted`":false,`"violation`":false}"
        try { Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType "application/json" -Body $b | Out-Null } catch {}
    }
    # Now try to get exam - should be full
    try {
        $rFull = Invoke-RestMethod -Uri "$base/api/exam/code/TEST-EXAM-API" -Method GET -ErrorAction SilentlyContinue
        Write-Host "  [FAIL] Exam should be full (capacity=5)" -ForegroundColor Red
    } catch {
        Test "Exam full - access blocked (403)" $_.Exception.Message "403|capacity|maximum"
    }
}

# ── TEST 13: Change password ──
Write-Host "`n[12] Change Password" -ForegroundColor Yellow
$cpBody = '{"currentPassword":"teacher123","newPassword":"newpass456"}'
try {
    $r13 = Invoke-RestMethod -Uri "$base/api/teacher/change-password" -Method POST -ContentType "application/json" -Body $cpBody
    Test "Password change accepted" ($r13.success) "True"
} catch { Write-Host "  [FAIL] Change password: $_" -ForegroundColor Red }

# Wrong current password
$cpBody2 = '{"currentPassword":"wrongpass","newPassword":"newpass456"}'
try {
    $r14 = Invoke-RestMethod -Uri "$base/api/teacher/change-password" -Method POST -ContentType "application/json" -Body $cpBody2 -ErrorAction SilentlyContinue
    Write-Host "  [FAIL] Wrong current password should be rejected" -ForegroundColor Red
} catch {
    Test "Wrong current password rejected (401)" $_.Exception.Message "401|Unauthorized"
}

# ── TEST 14: Export Excel ──
Write-Host "`n[13] Excel Export" -ForegroundColor Yellow
try {
    $r15 = Invoke-WebRequest -Uri "$base/api/export" -Method GET -UseBasicParsing
    Test "Excel export returns 200" ($r15.StatusCode -eq 200) "True"
    Test "Content-Type is xlsx" ($r15.Headers["Content-Type"]) "spreadsheetml"
} catch { Write-Host "  [FAIL] Export: $_" -ForegroundColor Red }

# ── CLEANUP: Delete test exam ──
Write-Host "`n[14] Cleanup - Delete Test Exam" -ForegroundColor Yellow
if ($examId) {
    try {
        $rDel = Invoke-RestMethod -Uri "$base/api/exams/$examId" -Method DELETE
        Test "Test exam deleted" ($rDel.success) "True"
    } catch { Write-Host "  [FAIL] Delete: $_" -ForegroundColor Red }
}

Write-Host "`n=== TESTING COMPLETE ===" -ForegroundColor Cyan
