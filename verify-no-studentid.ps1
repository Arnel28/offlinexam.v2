Start-Sleep 2
$page = (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing).Content
$js   = (Invoke-WebRequest -Uri 'http://localhost:3000/student/student.js' -UseBasicParsing).Content

Write-Host "`n=== Student ID Removal Verification ===" -ForegroundColor Cyan

# HTML checks
Write-Host "`n[HTML]" -ForegroundColor Yellow
if ($page -notmatch 'Enter your student ID') {
    Write-Host "  [PASS] Student ID placeholder removed from form" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Student ID placeholder still present" -ForegroundColor Red
}
if ($page -notmatch 'id="studentId"') {
    Write-Host "  [PASS] studentId input element removed" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] studentId input still in HTML" -ForegroundColor Red
}
if ($page -match 'id="firstName"') {
    Write-Host "  [PASS] firstName field still present" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] firstName field missing" -ForegroundColor Red
}
if ($page -match 'id="lastName"') {
    Write-Host "  [PASS] lastName field still present" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] lastName field missing" -ForegroundColor Red
}
if ($page -match 'id="examCode"') {
    Write-Host "  [PASS] examCode field still present" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] examCode field missing" -ForegroundColor Red
}

# JS checks
Write-Host "`n[JS]" -ForegroundColor Yellow
if ($js -match 'Auto-generate a unique studentId') {
    Write-Host "  [PASS] studentId auto-generated from name+timestamp" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Auto-generate logic missing" -ForegroundColor Red
}
if ($js -notmatch "getElementById\('studentId'\)") {
    Write-Host "  [PASS] No DOM read of studentId input" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Still reading studentId from DOM" -ForegroundColor Red
}
if ($js -notmatch "'ID: '") {
    Write-Host "  [PASS] 'ID: ' display label removed from exam screen" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] 'ID: ' display label still present" -ForegroundColor Red
}
if ($js -notmatch "studentInfo\.studentId\)") {
    Write-Host "  [PASS] studentId not shown on submitted screen" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] studentId still shown on submitted screen" -ForegroundColor Red
}
if ($js -match "'firstName', 'lastName', 'examCode'") {
    Write-Host "  [PASS] Enter key listener updated (no studentId)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Enter key listener still has studentId" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
