$s  = Get-Content 'c:\Users\Dell\Desktop\offline-exam-system\public\student\index.html' -Raw
$js = Get-Content 'c:\Users\Dell\Desktop\offline-exam-system\public\student\student.js' -Raw
$t  = Get-Content 'c:\Users\Dell\Desktop\offline-exam-system\public\teacher\index.html' -Raw
$tj = Get-Content 'c:\Users\Dell\Desktop\offline-exam-system\public\teacher\teacher.js' -Raw

$pass = 0; $fail = 0

function Chk($label, $ok) {
    if ($ok) { Write-Host "  [PASS] $label" -ForegroundColor Green; $script:pass++ }
    else      { Write-Host "  [FAIL] $label" -ForegroundColor Red;   $script:fail++ }
}

Write-Host ""
Write-Host "=== STATIC CODE VERIFICATION ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "-- Student HTML --" -ForegroundColor Yellow
Chk "No studentId input field"       ($s -notmatch 'id="studentId"')
Chk "firstName field present"        ($s -match 'id="firstName"')
Chk "lastName field present"         ($s -match 'id="lastName"')
Chk "examCode field present"         ($s -match 'id="examCode"')
Chk "Agreement modal present"        ($s -match 'agreementModal')
Chk "Anti-cheat warning bar"         ($s -match 'Do not leave this page')
Chk "Warning overlay present"        ($s -match 'warningOverlay')
Chk "Confirm submit modal"           ($s -match 'confirmModal')
Chk "Timer box present"              ($s -match 'timerBox')
Chk "Submitted screen present"       ($s -match 'submittedScreen')

Write-Host ""
Write-Host "-- Student JS --" -ForegroundColor Yellow
Chk "startExam() defined"            ($js -match 'function startExam')
Chk "proceedAfterAgreement() defined"($js -match 'function proceedAfterAgreement')
Chk "cancelAgreement() defined"      ($js -match 'function cancelAgreement')
Chk "toggleAgreeBtn() defined"       ($js -match 'function toggleAgreeBtn')
Chk "Auto-generate studentId"        ($js -match 'autoId')
Chk "No DOM read of studentId"       ($js -notmatch "getElementById\('studentId'\)")
Chk "MCQ select function"            ($js -match 'function selectMCQ')
Chk "TF select function"             ($js -match 'function selectTF')
Chk "Identification input class"     ($js -match 'id-input')
Chk "Timer start function"           ($js -match 'function startTimer')
Chk "Anti-cheat setup"               ($js -match 'function setupAntiCheat')
Chk "Beacon submit on exit"          ($js -match 'function sendBeaconSubmit')
Chk "Violation flag set"             ($js -match "violation.*violation")
Chk "visibilitychange listener"      ($js -match 'visibilitychange')
Chk "beforeunload listener"          ($js -match 'beforeunload')
Chk "Fullscreen request"             ($js -match 'requestFullscreen')
Chk "doSubmit() defined"             ($js -match 'function doSubmit')
Chk "showSubmittedScreen() defined"  ($js -match 'function showSubmittedScreen')
Chk "Enter key listener"             ($js -match "key.*Enter")

Write-Host ""
Write-Host "-- Teacher HTML --" -ForegroundColor Yellow
Chk "Login form present"             ($t -match 'teacherPassword')
Chk "Exam Builder tab"               ($t -match 'tab-builder')
Chk "Results tab"                    ($t -match 'tab-results')
Chk "Settings tab"                   ($t -match 'tab-settings')
Chk "Export Excel button"            ($t -match 'exportExcel')
Chk "MCQ add button"                 ($t -match "addQuestion\('mcq'\)")
Chk "TF add button"                  ($t -match "addQuestion\('truefalse'\)")
Chk "ID add button"                  ($t -match "addQuestion\('identification'\)")
Chk "Results table present"          ($t -match 'results-table')
Chk "Detail modal present"           ($t -match 'detailModal')
Chk "IP badge present"               ($t -match 'ipBadge')

Write-Host ""
Write-Host "-- Teacher JS --" -ForegroundColor Yellow
Chk "loadExamsList() defined"        ($tj -match 'function loadExamsList')
Chk "saveExam() defined"             ($tj -match 'function saveExam')
Chk "toggleExam() defined"           ($tj -match 'function toggleExam')
Chk "exportExcel() defined"          ($tj -match 'function exportExcel')
Chk "loadResults() defined"          ($tj -match 'function loadResults')
Chk "deleteExam() defined"           ($tj -match 'function deleteExam')
Chk "addQuestion() defined"          ($tj -match 'function addQuestion')
Chk "newExam() defined"              ($tj -match 'function newExam')
Chk "switchTab() defined"            ($tj -match 'function switchTab')
Chk "setStudentURL() defined"        ($tj -match 'function setStudentURL')
Chk "startAutoRefresh() defined"     ($tj -match 'function startAutoRefresh')
Chk "Violation badge in results"     ($tj -match 'violation')
$srv = Get-Content 'c:\Users\Dell\Desktop\offline-exam-system\server.js' -Raw
Chk "Alphabetical sort in server"    ($srv -match 'localeCompare')

Write-Host ""
$total = $pass + $fail
$color = if ($fail -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Static Check: $pass / $total PASSED  ($fail FAILED)" -ForegroundColor $color
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
