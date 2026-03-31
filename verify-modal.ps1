$page = (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing).Content
$jsPage = (Invoke-WebRequest -Uri 'http://localhost:3000/student/student.js' -UseBasicParsing).Content

Write-Host "`n=== Agreement Modal Verification ===" -ForegroundColor Cyan

$htmlChecks = @(
    'agreementModal',
    'agreeCheckbox',
    'agreeBtn',
    'proceedAfterAgreement',
    'cancelAgreement',
    'toggleAgreeBtn',
    'rules-list',
    'consequence-box',
    'agreement-card',
    'btn-agree',
    'btn-cancel-ag',
    'I Agree, Start Exam',
    'STRICTLY PROHIBITED',
    'Switching to another tab',
    'Pressing the Home button',
    'VIOLATION will be recorded'
)

Write-Host "`n[HTML - index.html]" -ForegroundColor Yellow
foreach ($c in $htmlChecks) {
    if ($page -match [regex]::Escape($c)) {
        Write-Host "  [PASS] $c" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $c" -ForegroundColor Red
    }
}

$jsChecks = @(
    'toggleAgreeBtn',
    'cancelAgreement',
    'proceedAfterAgreement',
    '_fetchAndLoadExam',
    'agreementModal',
    'agreeCheckbox',
    'agreeBtn',
    'Read the rules to continue',
    'Show agreement modal'
)

Write-Host "`n[JS - student.js]" -ForegroundColor Yellow
foreach ($c in $jsChecks) {
    if ($jsPage -match [regex]::Escape($c)) {
        Write-Host "  [PASS] $c" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $c" -ForegroundColor Red
    }
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
