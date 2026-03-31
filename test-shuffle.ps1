Start-Sleep 2

$base = 'http://localhost:3000'
$pass = 0; $fail = 0

function Chk($label, $ok) {
    if ($ok) { Write-Host "  [PASS] $label" -ForegroundColor Green; $script:pass++ }
    else      { Write-Host "  [FAIL] $label" -ForegroundColor Red;   $script:fail++ }
}

Write-Host ""
Write-Host "=== SHUFFLE + GRADING TEST ===" -ForegroundColor Cyan
Write-Host ""

# 1. Create exam
$body = @{
    title      = 'ShuffleTest'
    timeLimit  = 30
    questions  = @(
        @{ type='mcq'; question='Q1-Capital of France'; options=@('London','Berlin','Paris','Rome'); answer='C' },
        @{ type='truefalse'; question='Q2-Sky is blue'; answer='True' },
        @{ type='identification'; question='Q3-What is 2+2'; answer='4' }
    )
} | ConvertTo-Json -Depth 5

$exam = Invoke-RestMethod -Uri "$base/api/exam/create" -Method POST -ContentType 'application/json' -Body $body
Chk "Exam created" ($exam.success -eq $true)
$examId = $exam.exam.id
Write-Host "    ExamId: $examId"

# 2. Activate exam
$tog = Invoke-RestMethod -Uri "$base/api/exams/$examId/toggle" -Method POST
Chk "Exam activated" ($tog.active -eq $true)

# 3. Fetch exam as two different students (should get different question orders)
$s1 = Invoke-RestMethod -Uri "$base/api/exam/code/SHUFFLETEST"
$s2 = Invoke-RestMethod -Uri "$base/api/exam/code/SHUFFLETEST"

$q1order = ($s1.questions | ForEach-Object { $_.question }) -join ', '
$q2order = ($s2.questions | ForEach-Object { $_.question }) -join ', '
Write-Host "    Student1 order: $q1order"
Write-Host "    Student2 order: $q2order"

Chk "Questions returned for student1" ($s1.questions.Count -eq 3)
Chk "Questions returned for student2" ($s2.questions.Count -eq 3)
Chk "_answerMap returned for student1" ($s1._answerMap.Count -eq 3)
Chk "_answerMap returned for student2" ($s2._answerMap.Count -eq 3)

# 4. Submit with correct answers using answerMap (student1)
# Build answers array: for each position in shuffled order, give the correct answer
$ans1 = @()
foreach ($q in $s1._answerMap) {
    $ans1 += $q.answer
}
Write-Host "    Student1 correct answers: $($ans1 -join ', ')"

$sub1 = @{
    firstName     = 'Alice'
    lastName      = 'Smith'
    studentId     = 'smith_alice_001'
    examId        = $examId
    answers       = $ans1
    answerMap     = $s1._answerMap
    autoSubmitted = $false
    violation     = $false
} | ConvertTo-Json -Depth 5

$r1 = Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType 'application/json' -Body $sub1
Chk "Student1 submitted" ($r1.success -eq $true)

# 5. Submit with correct answers using answerMap (student2)
$ans2 = @()
foreach ($q in $s2._answerMap) {
    $ans2 += $q.answer
}
Write-Host "    Student2 correct answers: $($ans2 -join ', ')"

$sub2 = @{
    firstName     = 'Bob'
    lastName      = 'Jones'
    studentId     = 'jones_bob_002'
    examId        = $examId
    answers       = $ans2
    answerMap     = $s2._answerMap
    autoSubmitted = $false
    violation     = $false
} | ConvertTo-Json -Depth 5

$r2 = Invoke-RestMethod -Uri "$base/api/submit" -Method POST -ContentType 'application/json' -Body $sub2
Chk "Student2 submitted" ($r2.success -eq $true)

# 6. Check results - both should have 3/3
$results = Invoke-RestMethod -Uri "$base/api/results?examId=$examId"
Chk "2 results returned" ($results.Count -eq 2)

$alice = $results | Where-Object { $_.firstName -eq 'Alice' }
$bob   = $results | Where-Object { $_.firstName -eq 'Bob' }

Write-Host "    Alice score: $($alice.score)/$($alice.totalItems)"
Write-Host "    Bob score:   $($bob.score)/$($bob.totalItems)"

Chk "Alice got 3/3 (shuffle grading correct)" ($alice.score -eq 3 -and $alice.totalItems -eq 3)
Chk "Bob got 3/3 (shuffle grading correct)"   ($bob.score -eq 3 -and $bob.totalItems -eq 3)

# 7. Results sorted alphabetically (Jones before Smith)
Chk "Results sorted alphabetically (Jones before Smith)" ($results[0].lastName -eq 'Jones')

# 8. Cleanup
Invoke-RestMethod -Uri "$base/api/exams/$examId" -Method DELETE | Out-Null
Write-Host "    Cleanup done."

Write-Host ""
$total = $pass + $fail
$color = if ($fail -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Shuffle Test: $pass / $total PASSED  ($fail FAILED)" -ForegroundColor $color
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
