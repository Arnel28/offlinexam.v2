// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
var studentInfo = { firstName: '', lastName: '', studentId: '' };
var examData = null;
var answers = {};
var timerInterval = null;
var secondsLeft = 0;
var isExamActive = false;
var violations = 0;
var hasSubmitted = false;
var submitReason = null; // 'timer', 'violation', or null
var isViolationPending = false;  // true while waiting for teacher decision
var violationPollInterval = null;

// ── ONE-BY-ONE MODE STATE ──
var isOneByOneMode = false;
var currentOboIndex = 0;
var oboQTimerInterval = null;
var oboQSecondsLeft = 0;
var oboTimePerQuestion = 30;

// ─────────────────────────────────────────
//  SCREEN MANAGEMENT
// ─────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// Fetch server info and update UI based on deployment mode
async function fetchServerInfo() {
  try {
    const resp = await fetch('/api/server-info');
    if (!resp.ok) return; // Endpoint might not exist in older versions or server unreachable
    const data = await resp.json();
    const infoEl = document.getElementById('setupInfo');
    if (!infoEl) return;

    // Only override the message if in cloud mode
    if (data.mode === 'cloud') {
      infoEl.innerHTML = `🌐 Cloud Mode: Access from anywhere with internet.<br>Use the link provided by your teacher.`;
    }
    // If local mode (or any other), keep the default message in the HTML
  } catch (e) {
    // Silently fail - default message will remain
    console.log('Server info not available:', e);
  }
}

// Run coding question code and check output
async function runStudentCode(qi) {
  var codeEl = document.getElementById('code-' + qi);
  var outputEl = document.getElementById('output-' + qi);
  var matchEl = document.getElementById('match-' + qi);
  if (!codeEl || !outputEl) return;

  var code = codeEl.value;
  var q = examData.questions[qi];
  var input = document.getElementById('input-' + qi) ? document.getElementById('input-' + qi).value : '';

  outputEl.textContent = '⏳ Running...';
  outputEl.style.color = '#64748b';
  outputEl.style.background = '#f1f5f9';
  if (matchEl) matchEl.textContent = '';

  // Build request body; include databaseSchema for SQL
  var body = {
    code: code,
    language: q.language,
    input: input,
    examId: examData.id,
    questionId: qi
  };
  if (q.language === 'sql' && q.databaseSchema) {
    body.databaseSchema = q.databaseSchema;
  }

  try {
    var resp = await fetch('/api/run-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await resp.json();

    if (data.error) {
      outputEl.textContent = '❌ ' + data.error;
      outputEl.style.color = '#dc2626';
      outputEl.style.background = '#fef2f2';
      if (matchEl) matchEl.textContent = '❌';
      if (matchEl) matchEl.style.color = '#dc2626';
      // Store failed execution as answer? Not yet
      answers[qi] = { code: code, output: '', error: data.error, language: q.language };
    } else {
      outputEl.textContent = data.output || '(no output)';
      outputEl.style.color = '#1e293b';
      outputEl.style.background = '#1e293b';

      var expected = (q.expectedOutput || '').trim();
      var actual = (data.output || '').trim();
      var isMatch = actual === expected;

      if (matchEl) {
        matchEl.textContent = isMatch ? '✅ Matches expected output!' : '⚠️ Does not match expected output';
        matchEl.style.color = isMatch ? '#16a34a' : '#d97706';
      }

      // Store the result as the answer
      answers[qi] = {
        code: code,
        output: data.output,
        language: q.language,
        error: data.error || null
      };

      // If one-by-one mode, update next button state
      if (isOneByOneMode && isExamActive) {
        updateOboNextButton();
      }

      updateProgress();
      updateCardState(qi);
    }
  } catch (err) {
    outputEl.textContent = '❌ Network error: ' + err.message;
    outputEl.style.color = '#dc2626';
    outputEl.style.background = '#fef2f2';
    if (matchEl) matchEl.textContent = '❌';
    if (matchEl) matchEl.style.color = '#dc2626';
  }
}

// ─────────────────────────────────────────
//  AGREEMENT CHECKBOX — ENABLE START BUTTON
// ─────────────────────────────────────────
function toggleStartBtn() {
  var checked = document.getElementById('agreeCheckbox').checked;
  document.getElementById('startBtn').disabled = !checked;
}

// ─────────────────────────────────────────
//  NAME FIELD — CAPITALIZE + LETTERS ONLY
// ─────────────────────────────────────────
function setupNameFields() {
  ['firstName', 'lastName'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      // Remove non-letter characters (allow spaces and hyphens for compound names)
      var cleaned = this.value.replace(/[^a-zA-Z\s\-]/g, '');
      // Uppercase everything
      cleaned = cleaned.toUpperCase();
      // Preserve cursor position
      var pos = this.selectionStart - (this.value.length - cleaned.length);
      this.value = cleaned;
      try { this.setSelectionRange(pos, pos); } catch (e) {}
    });
    // Also handle paste
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData('text');
      var cleaned = pasted.replace(/[^a-zA-Z\s\-]/g, '').toUpperCase();
      document.execCommand('insertText', false, cleaned);
    });
  });
}

// ─────────────────────────────────────────
//  LOGIN — START EXAM
// ─────────────────────────────────────────
function startExam() {
  var firstName = document.getElementById('firstName').value.trim().toUpperCase();
  var lastName  = document.getElementById('lastName').value.trim().toUpperCase();
  var examCode  = document.getElementById('examCode').value.trim().toUpperCase();
  var errEl     = document.getElementById('loginError');
  var btn       = document.getElementById('startBtn');

  errEl.style.display = 'none';

  if (!firstName || !lastName || !examCode) {
    errEl.textContent = 'Please fill in all fields including the Exam Code.';
    errEl.style.display = 'block';
    return;
  }

  // Validate letters only
  if (!/^[A-Z\s\-]+$/.test(firstName) || !/^[A-Z\s\-]+$/.test(lastName)) {
    errEl.textContent = 'First and Last Name must contain letters only.';
    errEl.style.display = 'block';
    return;
  }

  var autoId = (lastName + '_' + firstName).toLowerCase().replace(/\s+/g, '') + '_' + Date.now();
  studentInfo = { firstName: firstName, lastName: lastName, studentId: autoId };

  // Proceed directly — checkbox already checked (button was disabled until checked)
  btn.disabled = true;
  btn.textContent = 'Loading exam...';
  _fetchAndLoadExam();
}

function _fetchAndLoadExam() {
  var examCode  = document.getElementById('examCode').value.trim().toUpperCase();
  var errEl     = document.getElementById('loginError');
  var btn       = document.getElementById('startBtn');

  btn.disabled = true;
  btn.textContent = 'Loading exam...';

  fetch('/api/exam/code/' + encodeURIComponent(examCode))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = 'Start Exam →';

      // Capacity exceeded — show pop-up modal
      if (data.error === 'capacity_exceeded') {
        showCapacityModal(data.message || ('This exam is full (' + data.maxStudents + ' students online). Please go to your teacher.'));
        return;
      }

      if (data.error) {
        errEl.textContent = data.error;
        errEl.style.display = 'block';
        return;
      }

      // Check localStorage first (same device)
      var alreadyDone = checkAlreadySubmitted(data.title);
      if (alreadyDone) {
        showAlreadySubmittedScreen(alreadyDone);
        return;
      }

      examData = data;
      examData._answerMap = data._answerMap || null;

      // Join exam — server checks cross-device duplicate & capacity
      joinExam(function (joinErr) {
        if (joinErr) {
          if (joinErr.error === 'already_submitted') {
            // Server confirmed already submitted (different device)
            showAlreadySubmittedScreen({
              examTitle:   joinErr.examTitle || examData.title,
              studentName: joinErr.studentName || (studentInfo.lastName + ', ' + studentInfo.firstName),
              submittedAt: joinErr.submittedAt || ''
            });
          } else if (joinErr.error === 'capacity_exceeded') {
            showCapacityModal(joinErr.message || 'This exam is currently full. Please go to your teacher.');
          } else {
            errEl.textContent = joinErr.message || joinErr.error || 'Failed to join exam.';
            errEl.style.display = 'block';
          }
          return;
        }
        loadExam();
      });
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Start Exam →';
      errEl.textContent = 'Cannot connect to server. Make sure you are on the correct WiFi.';
      errEl.style.display = 'block';
    });
}

// ─────────────────────────────────────────
//  JOIN EXAM
// ─────────────────────────────────────────
function joinExam(callback) {
  fetch('/api/students/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: studentInfo.studentId,
        firstName: studentInfo.firstName,
        lastName: studentInfo.lastName,
        examId: examData.id,
        platform: window.IS_NATIVE_APP ? 'app' : 'browser'
      })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        if (callback) callback(null); // success
      } else {
        if (callback) callback(data); // pass error object
      }
    })
    .catch(function () {
      // Network error — allow to proceed (graceful degradation)
      if (callback) callback(null);
    });
}

// ─────────────────────────────────────────
//  CAPACITY EXCEEDED MODAL
// ─────────────────────────────────────────
function showCapacityModal(msg) {
  var el = document.getElementById('capacityModalMsg');
  if (el) el.textContent = msg;
  var modal = document.getElementById('capacityModal');
  if (modal) modal.style.display = 'flex';
}

function closeCapacityModal() {
  var modal = document.getElementById('capacityModal');
  if (modal) modal.style.display = 'none';
}

// ─────────────────────────────────────────
//  WATERMARK
// ─────────────────────────────────────────
function initWatermark(containerId) {
  var wm = document.getElementById(containerId || 'examWatermark');
  if (!wm) return;
  wm.innerHTML = '';

  var name = studentInfo.lastName + ', ' + studentInfo.firstName;
  var line1 = name;
  var line2 = '📋 ' + (examData.title || 'EXAM') + ' • CONFIDENTIAL';
  var line3 = new Date().toLocaleString();

  var screenW = window.innerWidth || 400;
  var screenH = window.innerHeight || 800;
  var tileW = 320;
  var tileH = 110;
  var cols = Math.ceil(screenW / tileW) + 2;
  var rows = Math.ceil(screenH / tileH) + 4;

  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var div = document.createElement('div');
      div.className = 'wm-tile';
      div.innerHTML = escHtml(line1) + '<br>' + escHtml(line2) + '<br>' + escHtml(line3);
      div.style.left = (c * tileW - 80) + 'px';
      div.style.top  = (r * tileH - 40) + 'px';
      wm.appendChild(div);
    }
  }
  wm.classList.add('active');
}

// ─────────────────────────────────────────
//  LOAD EXAM  (branches on questionMode)
// ─────────────────────────────────────────
function loadExam() {
  answers = {};
  isExamActive = true;
  hasSubmitted = false;
  submitReason = null;
  isViolationPending = false;

  isOneByOneMode = (examData.questionMode === 'one-by-one');
  oboTimePerQuestion = examData.timePerQuestion || 30;

  if (isOneByOneMode) {
    loadOneByOneMode();
    return;
  }

  // ── SCROLL MODE (default) ──
  document.getElementById('examTitleBar').textContent = examData.title || 'Exam';

  var initials = (studentInfo.firstName.charAt(0) + studentInfo.lastName.charAt(0)).toUpperCase();
  document.getElementById('studentAvatar').textContent = initials;
  document.getElementById('studentNameBar').textContent = studentInfo.lastName + ', ' + studentInfo.firstName;

  var subText = examData.title || 'Exam';
  if (examData.maxStudents > 0 && examData.remainingSlots <= 5 && examData.remainingSlots > 0) {
    subText += ' | ⚠️ Only ' + examData.remainingSlots + ' slots left!';
  }
  document.getElementById('studentIdBar').textContent = subText;

  renderQuestions();
  updateProgress();

  secondsLeft = (examData.timeLimit || 60) * 60;
  startTimer();

  showScreen('examScreen');
  initWatermark('examWatermark');
  setupAntiCheat();

  try {
    var ua = navigator.userAgent.toLowerCase();
    if (!/android|iphone|ipad|ipod|mobile/.test(ua)) requestFullscreen();
  } catch (e) { }
}

// ─────────────────────────────────────────
//  ONE-BY-ONE MODE
// ─────────────────────────────────────────
function loadOneByOneMode() {
  currentOboIndex = 0;

  document.getElementById('oboTitleBar').textContent = examData.title || 'Exam';
  document.getElementById('oboQTotal').textContent = examData.questions.length;

  // Start overall exam timer (same logic as scroll mode)
  secondsLeft = (examData.timeLimit || 60) * 60;
  startOboOverallTimer();

  // Show first question
  renderOboQuestion(0);

  showScreen('oboScreen');
  initWatermark('oboWatermark');
  setupAntiCheat();

  try {
    var ua = navigator.userAgent.toLowerCase();
    if (!/android|iphone|ipad|ipod|mobile/.test(ua)) requestFullscreen();
  } catch (e) { }
}

// Overall exam timer for one-by-one mode (updates #oboOverallTimer)
function startOboOverallTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateOboOverallTimerDisplay();
  timerInterval = setInterval(function () {
    if (isViolationPending) return;
    secondsLeft--;
    updateOboOverallTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      // Fix 3: Also clear per-question timer to avoid conflicting state
      if (oboQTimerInterval) { clearInterval(oboQTimerInterval); oboQTimerInterval = null; }
      submitReason = 'timer';
      autoSubmit();
    }
  }, 1000);
}

function updateOboOverallTimerDisplay() {
  var mins = Math.floor(secondsLeft / 60);
  var secs = secondsLeft % 60;
  var box = document.getElementById('oboOverallTimer');
  if (!box) return;
  box.textContent = pad(mins) + ':' + pad(secs);
  box.className = 'timer-box';
  if (secondsLeft <= 60) box.className = 'timer-box danger';
  else if (secondsLeft <= 300) box.className = 'timer-box warning';
}

// Render a single question in one-by-one mode
function renderOboQuestion(i) {
  var q = examData.questions[i];
  var total = examData.questions.length;
  var isLast = (i === total - 1);

  // Update counter
  document.getElementById('oboQNum').textContent = i + 1;
  document.getElementById('oboQNumBadge').textContent = i + 1;

  // Update type badge
  var typeLabel = q.type === 'mcq' ? 'Multiple Choice' : q.type === 'truefalse' ? 'True / False' : 'Identification';
  var typeCls   = q.type === 'mcq' ? 'q-type-mcq' : q.type === 'truefalse' ? 'q-type-tf' : 'q-type-id';
  var typeBadge = document.getElementById('oboQTypeBadge');
  typeBadge.textContent = typeLabel;
  typeBadge.className = 'q-type-badge ' + typeCls;

  // Update question text
  document.getElementById('oboQText').textContent = q.question;

  // Render answer area
  var area = document.getElementById('oboAnswerArea');
  area.innerHTML = '';
  area.appendChild(buildOboAnswerElement(q, i));

  // Show correct footer button
  var nextBtn   = document.getElementById('oboNextBtn');
  var submitBtn = document.getElementById('oboSubmitBtn');
  if (isLast) {
    nextBtn.style.display   = 'none';
    submitBtn.style.display = 'block';
    submitBtn.disabled = true;
  } else {
    nextBtn.style.display   = 'block';
    nextBtn.disabled = true;
    submitBtn.style.display = 'none';
  }

  // Update answered badge
  updateOboAnsweredBadge(i);

  // Start per-question timer
  startOboQTimer();
}

// Build the answer element for one-by-one mode
function buildOboAnswerElement(q, i) {
  var wrap = document.createElement('div');

  if (q.type === 'mcq') {
    wrap.className = 'mcq-options';
    var labels = ['A', 'B', 'C', 'D'];
    q.options.forEach(function (opt, oi) {
      var lbl = labels[oi];
      var div = document.createElement('div');
      div.className = 'mcq-option' + (answers[i] === lbl ? ' selected' : '');
      div.id = 'obo-opt-' + i + '-' + oi;
      div.innerHTML =
        '<div class="option-circle"><div class="option-check"></div></div>' +
        '<span class="option-lbl">' + lbl + '.</span>' +
        '<span>' + escHtml(opt) + '</span>';
      div.addEventListener('click', function () { oboSelectMCQ(i, lbl, oi); });
      wrap.appendChild(div);
    });

  } else if (q.type === 'truefalse') {
    wrap.className = 'tf-options';
    var trueBtn = document.createElement('div');
    trueBtn.className = 'tf-btn' + (answers[i] === 'True' ? ' selected-true' : '');
    trueBtn.id = 'obo-tf-' + i + '-true';
    trueBtn.textContent = '✓ True';
    trueBtn.addEventListener('click', function () { oboSelectTF(i, 'True'); });
    var falseBtn = document.createElement('div');
    falseBtn.className = 'tf-btn' + (answers[i] === 'False' ? ' selected-false' : '');
    falseBtn.id = 'obo-tf-' + i + '-false';
    falseBtn.textContent = '✗ False';
    falseBtn.addEventListener('click', function () { oboSelectTF(i, 'False'); });
    wrap.appendChild(trueBtn);
    wrap.appendChild(falseBtn);

  } else {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'id-input';
    inp.placeholder = 'Type your answer here...';
    inp.value = answers[i] !== undefined ? answers[i] : '';
    inp.setAttribute('data-qi', i);
    inp.addEventListener('input', function () {
      var qi = parseInt(this.getAttribute('data-qi'));
      answers[qi] = this.value;
      updateOboAnsweredBadge(qi);
    });
    wrap.appendChild(inp);
  }
  return wrap;
}

function oboSelectMCQ(qi, label, oi) {
  for (var j = 0; j < 4; j++) {
    var el = document.getElementById('obo-opt-' + qi + '-' + j);
    if (el) el.classList.remove('selected');
  }
  var chosen = document.getElementById('obo-opt-' + qi + '-' + oi);
  if (chosen) chosen.classList.add('selected');
  answers[qi] = label;
  updateOboAnsweredBadge(qi);
}

function oboSelectTF(qi, val) {
  var t = document.getElementById('obo-tf-' + qi + '-true');
  var f = document.getElementById('obo-tf-' + qi + '-false');
  if (t) t.className = 'tf-btn';
  if (f) f.className = 'tf-btn';
  if (val === 'True'  && t) t.className = 'tf-btn selected-true';
  if (val === 'False' && f) f.className = 'tf-btn selected-false';
  answers[qi] = val;
  updateOboAnsweredBadge(qi);
}

// Check if a coding question answer matches expected output
function isCodingAnswerCorrect(i) {
  var ans = answers[i];
  var q = examData.questions[i];
  if (!q || q.type !== 'coding') return true; // not a coding question
  if (!ans || typeof ans !== 'object') return false;
  if (!q.expectedOutput) return true; // no expected output set (should not happen)
  var expected = (q.expectedOutput || '').trim();
  var actual = (ans.output || '').trim();
  return actual === expected;
}

// Update the "answered / not answered" badge and enable/disable Next/Submit
function updateOboAnsweredBadge(i) {
  var ans = answers[i];
  var q = examData.questions[i];
  var isCoding = q && q.type === 'coding';
  var hasAnswer;

  if (isCoding) {
    // For coding, answer exists and output matches expected
    hasAnswer = ans !== undefined && ans !== null && isCodingAnswerCorrect(i);
  } else {
    hasAnswer = ans !== undefined && ans !== null && String(ans).trim() !== '';
  }

  var badge     = document.getElementById('oboAnsweredBadge');
  var nextBtn   = document.getElementById('oboNextBtn');
  var submitBtn = document.getElementById('oboSubmitBtn');
  var isLast    = (i === examData.questions.length - 1);

  if (badge) {
    badge.innerHTML = hasAnswer
      ? '<span class="obo-answered-badge">✓ Answered</span>'
      : 'Not answered yet';
  }
  if (isLast) {
    if (submitBtn) submitBtn.disabled = !hasAnswer;
  } else {
    if (nextBtn) nextBtn.disabled = !hasAnswer;
  }
}

// Per-question countdown timer
function startOboQTimer() {
  if (oboQTimerInterval) { clearInterval(oboQTimerInterval); oboQTimerInterval = null; }
  oboQSecondsLeft = oboTimePerQuestion;
  updateOboQTimerDisplay();
  oboQTimerInterval = setInterval(function () {
    if (isViolationPending) return;
    oboQSecondsLeft--;
    updateOboQTimerDisplay();
    if (oboQSecondsLeft <= 0) {
      clearInterval(oboQTimerInterval);
      oboQTimerInterval = null;
      advanceOboQuestion(); // auto-advance when per-question timer hits 0
    }
  }, 1000);
}

function updateOboQTimerDisplay() {
  var mins = Math.floor(oboQSecondsLeft / 60);
  var secs = oboQSecondsLeft % 60;
  var box = document.getElementById('oboQTimer');
  if (!box) return;
  box.textContent = pad(mins) + ':' + pad(secs);
  box.className = 'obo-q-timer';
  if (oboQSecondsLeft <= 5)  box.className = 'obo-q-timer danger';
  else if (oboQSecondsLeft <= 10) box.className = 'obo-q-timer warning';
}

// Advance to next question (called by timer OR by nextOboQuestion after answering)
function advanceOboQuestion() {
  if (!isExamActive || hasSubmitted) return;

  // Stop per-question timer
  if (oboQTimerInterval) { clearInterval(oboQTimerInterval); oboQTimerInterval = null; }

  var total = examData.questions.length;

  if (currentOboIndex >= total - 1) {
    // Last question — auto-submit the exam
    // Fix 2: Enable submit button so student can manually retry if auto-submit fails
    var submitBtn = document.getElementById('oboSubmitBtn');
    if (submitBtn) submitBtn.disabled = false;
    submitReason = 'timer';
    autoSubmit();
  } else {
    currentOboIndex++;
    renderOboQuestion(currentOboIndex);
  }
}

// Called by the "Next →" button — only advances if the student has answered
function nextOboQuestion() {
  if (!isExamActive || hasSubmitted) return;
  var qi = currentOboIndex;
  var ans = answers[qi];
  var q = examData.questions[qi];
  var isCoding = q && q.type === 'coding';
  var hasAnswer;

  if (isCoding) {
    hasAnswer = ans !== undefined && ans !== null && isCodingAnswerCorrect(qi);
  } else {
    hasAnswer = ans !== undefined && ans !== null && String(ans).trim() !== '';
  }

  if (!hasAnswer) return; // safety check (button should already be disabled)
  advanceOboQuestion();
}

// ─────────────────────────────────────────
//  RENDER QUESTIONS
// ─────────────────────────────────────────
function renderQuestions() {
  var area = document.getElementById('questionsArea');
  area.innerHTML = '';

  examData.questions.forEach(function (q, i) {
    var card = document.createElement('div');
    card.className = 'q-card';
    card.id = 'qcard-' + i;

    var typeLabel = q.type === 'mcq' ? 'Multiple Choice' : q.type === 'truefalse' ? 'True / False' : 'Identification';
    var typeCls   = q.type === 'mcq' ? 'q-type-mcq' : q.type === 'truefalse' ? 'q-type-tf' : 'q-type-id';

    var header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML =
      '<div class="q-number">' + (i + 1) + '</div>' +
      '<span class="q-type-badge ' + typeCls + '">' + typeLabel + '</span>' +
      '<div class="q-text">' + escHtml(q.question) + '</div>';
    card.appendChild(header);
    card.appendChild(buildAnswerElement(q, i));
    area.appendChild(card);
  });
}

function buildAnswerElement(q, i) {
  var wrap = document.createElement('div');

  if (q.type === 'mcq') {
    wrap.className = 'mcq-options';
    var labels = ['A', 'B', 'C', 'D'];
    q.options.forEach(function (opt, oi) {
      var lbl = labels[oi];
      var div = document.createElement('div');
      div.className = 'mcq-option';
      div.id = 'opt-' + i + '-' + oi;
      div.innerHTML =
        '<div class="option-circle"><div class="option-check"></div></div>' +
        '<span class="option-lbl">' + lbl + '.</span>' +
        '<span>' + escHtml(opt) + '</span>';
      div.addEventListener('click', function () { selectMCQ(i, lbl, oi); });
      wrap.appendChild(div);
    });

  } else if (q.type === 'truefalse') {
    wrap.className = 'tf-options';
    var trueBtn = document.createElement('div');
    trueBtn.className = 'tf-btn';
    trueBtn.id = 'tf-' + i + '-true';
    trueBtn.textContent = '✓ True';
    trueBtn.addEventListener('click', function () { selectTF(i, 'True'); });
    var falseBtn = document.createElement('div');
    falseBtn.className = 'tf-btn';
    falseBtn.id = 'tf-' + i + '-false';
    falseBtn.textContent = '✗ False';
    falseBtn.addEventListener('click', function () { selectTF(i, 'False'); });
    wrap.appendChild(trueBtn);
    wrap.appendChild(falseBtn);

  } else if (q.type === 'coding') {
    wrap.className = 'coding-answer';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px';

    // Language label
    var langLabel = document.createElement('div');
    langLabel.style.cssText = 'font-size:.85rem;color:#64748b;font-weight:600';
    langLabel.textContent = 'Language: ' + (q.language || 'javascript');
    wrap.appendChild(langLabel);

    // Code editor (textarea)
    var codeTA = document.createElement('textarea');
    codeTA.rows = 10;
    codeTA.value = q.codeTemplate || '';
    codeTA.placeholder = '// Write your code here...';
    codeTA.style.cssText = 'font-family:Consolas,Monaco,monospace;font-size:14px;padding:12px;border:1.5px solid #cbd5e1;border-radius:8px;background:#1e293b;color:#e2e8f0;resize:vertical;width:100%';
    codeTA.id = 'code-' + i;
    wrap.appendChild(codeTA);

    // Input (stdin) if provided
    if (q.input || q.language === 'sql') {
      var inputLabel = document.createElement('label');
      inputLabel.style.cssText = 'font-size:.85rem;font-weight:600;color:#334155';
      inputLabel.textContent = 'Input (stdin)';
      wrap.appendChild(inputLabel);
      var inputTA = document.createElement('textarea');
      inputTA.rows = 2;
      inputTA.value = q.input || '';
      inputTA.placeholder = 'Enter input data (if required)';
      inputTA.style.cssText = 'width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-family:monospace';
      inputTA.id = 'input-' + i;
      wrap.appendChild(inputTA);
    }

    // Run button
    var runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.textContent = '▶ Run Code';
    runBtn.style.cssText = 'align-self:flex-start;padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600';
    runBtn.setAttribute('data-qi', i);
    runBtn.addEventListener('click', function() {
      runStudentCode(parseInt(this.getAttribute('data-qi')));
    });
    wrap.appendChild(runBtn);

    // Output area
    var outputPre = document.createElement('pre');
    outputPre.id = 'output-' + i;
    outputPre.style.cssText = 'background:#1e293b;color:#22c55e;padding:12px;border-radius:8px;margin-top:8px;font-family:monospace;font-size:13px;min-height:60px;overflow-x:auto;width:100%;box-sizing:border-box';
    outputPre.textContent = 'Output will appear here...';
    wrap.appendChild(outputPre);

    // Expected output hint
    var expDiv = document.createElement('div');
    expDiv.style.cssText = 'font-size:.85rem;color:#64748b;margin-top:4px';
    expDiv.innerHTML = 'Expected: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#1e293b">' + escHtml(q.expectedOutput) + '</code> <span id="match-' + i + '" style="margin-left:8px;font-weight:600"></span>';
    wrap.appendChild(expDiv);

  } else {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'id-input';
    inp.placeholder = 'Type your answer here...';
    inp.setAttribute('data-qi', i);
    inp.addEventListener('input', function () {
      var qi = parseInt(this.getAttribute('data-qi'));
      answers[qi] = this.value;
      updateProgress();
      updateCardState(qi);
    });
    wrap.appendChild(inp);
  }
  return wrap;
}

function selectMCQ(qi, label, oi) {
  for (var j = 0; j < 4; j++) {
    var el = document.getElementById('opt-' + qi + '-' + j);
    if (el) el.classList.remove('selected');
  }
  var chosen = document.getElementById('opt-' + qi + '-' + oi);
  if (chosen) chosen.classList.add('selected');
  answers[qi] = label;
  updateProgress();
  updateCardState(qi);
}

function selectTF(qi, val) {
  var t = document.getElementById('tf-' + qi + '-true');
  var f = document.getElementById('tf-' + qi + '-false');
  if (t) t.className = 'tf-btn';
  if (f) f.className = 'tf-btn';
  if (val === 'True' && t) t.className = 'tf-btn selected-true';
  if (val === 'False' && f) f.className = 'tf-btn selected-false';
  answers[qi] = val;
  updateProgress();
  updateCardState(qi);
}

function updateCardState(qi) {
  var card = document.getElementById('qcard-' + qi);
  if (!card) return;
  var ans = answers[qi];
  var has = ans !== undefined && ans !== null && String(ans).trim() !== '';
  card.classList.toggle('answered', has);
}

function updateProgress() {
  if (!examData) return;
  var total = examData.questions.length;
  var answered = 0;
  for (var i = 0; i < total; i++) {
    var ans = answers[i];
    if (ans !== undefined && ans !== null && String(ans).trim() !== '') answered++;
  }
  var pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  document.getElementById('progressText').textContent = answered + ' / ' + total + ' answered';
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('submitProgress').textContent = answered + ' of ' + total + ' answered';
}

// ─────────────────────────────────────────
//  TIMER  (pauses during violation pending)
// ─────────────────────────────────────────
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(function () {
    if (isViolationPending) return; // ← PAUSE while waiting for teacher
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      submitReason = 'timer';
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  var mins = Math.floor(secondsLeft / 60);
  var secs = secondsLeft % 60;
  var box = document.getElementById('timerBox');
  box.textContent = pad(mins) + ':' + pad(secs);
  box.className = 'timer-box';
  if (secondsLeft <= 60) box.className = 'timer-box danger';
  else if (secondsLeft <= 300) box.className = 'timer-box warning';
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

function autoSubmit() {
  if (!isExamActive || hasSubmitted) return;
  doSubmit(true);
}

// ─────────────────────────────────────────
//  VIOLATION SYSTEM
// ─────────────────────────────────────────

var _violationTypeLabels = {
  'tab_switch':   '📵 You switched to another tab or app.',
  'window_blur':  '🖥️ You left the exam window.',
  'screenshot':   '📸 A screenshot attempt was detected.'
};

function triggerViolation(type) {
  if (!isExamActive || hasSubmitted) return;
  violations++;

  submitReason = 'violation';
  isViolationPending = true;

  // Blur the active exam screen (scroll mode or one-by-one mode)
  var activeScreen = document.getElementById(isOneByOneMode ? 'oboScreen' : 'examScreen');
  if (activeScreen) activeScreen.classList.add('violation-blur');

  // Update overlay message
  var msgEl = document.getElementById('violationTypeMsg');
  if (msgEl) msgEl.textContent = _violationTypeLabels[type] || 'A violation was detected.';
  var countEl = document.getElementById('violationCountDisplay');
  if (countEl) countEl.textContent = violations;

  // Show warning overlay
  var overlay = document.getElementById('warningOverlay');
  if (overlay) overlay.classList.add('show');

  // Report to server
  reportViolation(type);

  // Start polling for teacher's decision
  startViolationPoll();
}

function reportViolation(type) {
  if (!examData || !studentInfo.studentId) return;
  fetch('/api/violations/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId:     studentInfo.studentId,
      firstName:     studentInfo.firstName,
      lastName:      studentInfo.lastName,
      examId:        examData.id,
      violationType: type
    })
  }).catch(function () { });
}

function startViolationPoll() {
  stopViolationPoll(); // clear any existing poll
  violationPollInterval = setInterval(function () {
    if (!isExamActive || hasSubmitted) { stopViolationPoll(); return; }
    fetch('/api/violations/check?studentId=' + encodeURIComponent(studentInfo.studentId) + '&examId=' + encodeURIComponent(examData.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'allowed') {
          // Teacher allowed — resume exam
          stopViolationPoll();
          resumeAfterViolation();
        } else if (data.status === 'force_submit') {
          // Teacher force submitted
          stopViolationPoll();
          isViolationPending = false;
          doSubmit(true);
        }
        // 'pending' or 'none' → keep polling
      })
      .catch(function () { /* network error, keep polling */ });
  }, 2000);
}

function stopViolationPoll() {
  if (violationPollInterval) {
    clearInterval(violationPollInterval);
    violationPollInterval = null;
  }
}

function resumeAfterViolation() {
  isViolationPending = false;
  submitReason = null; // reset so normal submit works

  // Remove blur from active exam screen
  var activeScreen = document.getElementById(isOneByOneMode ? 'oboScreen' : 'examScreen');
  if (activeScreen) activeScreen.classList.remove('violation-blur');

  // Hide overlay
  var overlay = document.getElementById('warningOverlay');
  if (overlay) overlay.classList.remove('show');

  // Re-request fullscreen
  try { requestFullscreen(); } catch (e) { }
}

// ─────────────────────────────────────────
//  ANTI-CHEAT SETUP
// ─────────────────────────────────────────
function setupAntiCheat() {
  // Tab switch / app switch (also fires on mobile when switching apps)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && isExamActive && !hasSubmitted && !isViolationPending) {
      triggerViolation('tab_switch');
    }
  });

  // Window loses focus (desktop: Alt+Tab, switching windows)
  window.addEventListener('blur', function () {
    if (isExamActive && !hasSubmitted && !isViolationPending) {
      // Small delay to avoid false positives (e.g. mobile keyboard)
      setTimeout(function () {
        if (isExamActive && !hasSubmitted && !isViolationPending && document.hidden === false) {
          triggerViolation('window_blur');
        }
      }, 300);
    }
  });

  // Screenshot detection:
  // Desktop: PrintScreen key
  // Mobile: visibilitychange covers most cases (pulling notification shade to screenshot)
  document.addEventListener('keydown', function (e) {
    if (!isExamActive || hasSubmitted) return;

    // PrintScreen (desktop)
    if (e.key === 'PrintScreen' || e.key === 'Print' || e.keyCode === 44) {
      e.preventDefault();
      triggerViolation('screenshot');
      return;
    }
    // Windows Snipping Tool: Win+Shift+S
    if (e.metaKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      triggerViolation('screenshot');
      return;
    }
    // macOS screenshot: Cmd+Shift+3 or Cmd+Shift+4 or Cmd+Shift+5
    if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
      e.preventDefault();
      triggerViolation('screenshot');
      return;
    }
    // Ctrl+P (Print — can capture screen content)
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      triggerViolation('screenshot');
      return;
    }
    // Alt+PrintScreen (Windows active window screenshot)
    if (e.altKey && (e.key === 'PrintScreen' || e.keyCode === 44)) {
      e.preventDefault();
      triggerViolation('screenshot');
      return;
    }
    // Block dev tools
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) e.preventDefault();
    if (e.ctrlKey && e.key === 'u') e.preventDefault();
  });

  // Prevent copy/cut of exam content
  document.addEventListener('copy', function (e) {
    if (isExamActive && !hasSubmitted) e.preventDefault();
  });
  document.addEventListener('cut', function (e) {
    if (isExamActive && !hasSubmitted) e.preventDefault();
  });

  // Prevent right-click
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Beacon submit on actual page close/navigation
  window.addEventListener('pagehide', function () {
    if (isExamActive && !hasSubmitted) {
      submitReason = 'violation';
      sendBeaconSubmit();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (isExamActive && !hasSubmitted) {
      submitReason = 'violation';
      sendBeaconSubmit();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ─────────────────────────────────────────
//  BEACON SUBMIT (page close fallback)
// ─────────────────────────────────────────
function buildAnswersArray() {
  var arr = [];
  if (examData) {
    for (var i = 0; i < examData.questions.length; i++) {
      var q = examData.questions[i];
      var ans = answers[i];
      if (ans !== undefined && ans !== null) {
        arr.push(ans);
      } else if (q.type === 'coding') {
        // For coding questions, if not explicitly stored (student didn't click Run), capture from textarea
        var codeEl = document.getElementById('code-' + i);
        if (codeEl && codeEl.value.trim()) {
          arr.push({
            code: codeEl.value,
            output: '',
            language: q.language
          });
        } else {
          arr.push('');
        }
      } else {
        arr.push('');
      }
    }
  }
  return arr;
}

function sendBeaconSubmit() {
  if (!examData || !studentInfo.studentId || hasSubmitted) return;
  hasSubmitted = true;
  isExamActive = false;
  stopViolationPoll();

  var payload = JSON.stringify({
    firstName:     studentInfo.firstName,
    lastName:      studentInfo.lastName,
    studentId:     studentInfo.studentId,
    examId:        examData.id,
    answers:       buildAnswersArray(),
    answerMap:     examData._answerMap || null,
    autoSubmitted: true,
    violation:     submitReason === 'violation'
  });

  var sent = false;
  if (navigator.sendBeacon) {
    sent = navigator.sendBeacon('/api/submit/beacon', new Blob([payload], { type: 'application/json' }));
  }
  if (!sent) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/submit', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payload);
    } catch (e) { }
  }
}

// ─────────────────────────────────────────
//  FULLSCREEN
// ─────────────────────────────────────────
function requestFullscreen() {
  var el = document.documentElement;
  var p = null;
  if (el.requestFullscreen) p = el.requestFullscreen();
  else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
  else if (el.msRequestFullscreen) p = el.msRequestFullscreen();
  if (p && p.catch) p.catch(function () { });
}

// ─────────────────────────────────────────
//  SUBMIT
// ─────────────────────────────────────────
function confirmSubmit() {
  if (isViolationPending) return; // block manual submit while violation pending
  var total = examData ? examData.questions.length : 0;
  var answered = 0;
  for (var i = 0; i < total; i++) {
    var ans = answers[i];
    if (ans !== undefined && ans !== null && String(ans).trim() !== '') answered++;
  }
  var unanswered = total - answered;
  document.getElementById('confirmMsg').textContent = unanswered > 0
    ? 'You have ' + unanswered + ' unanswered question(s). Submit anyway?'
    : 'Are you sure you want to submit your exam?';
  document.getElementById('confirmModal').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
}

function doSubmit(isAuto) {
  closeConfirm();
  if (hasSubmitted) return;
  hasSubmitted = true;
  isExamActive = false;
  isViolationPending = false;
  stopViolationPoll();

  if (timerInterval) clearInterval(timerInterval);
  // Stop per-question timer if in one-by-one mode
  if (oboQTimerInterval) { clearInterval(oboQTimerInterval); oboQTimerInterval = null; }

  // Remove blur from both screens
  var examScreen = document.getElementById('examScreen');
  if (examScreen) examScreen.classList.remove('violation-blur');
  var oboScreen = document.getElementById('oboScreen');
  if (oboScreen) oboScreen.classList.remove('violation-blur');
  var overlay = document.getElementById('warningOverlay');
  if (overlay) overlay.classList.remove('show');

  fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName:     studentInfo.firstName,
      lastName:      studentInfo.lastName,
      studentId:     studentInfo.studentId,
      examId:        examData.id,
      answers:       buildAnswersArray(),
      answerMap:     examData._answerMap || null,
      autoSubmitted: isAuto === true,
      violation:     submitReason === 'violation',
      platform:      window.IS_NATIVE_APP ? 'app' : 'browser'
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        showSubmittedScreen(submitReason);
      } else {
        alert(data.error || 'Submission failed. Please try again.');
        hasSubmitted = false;
        isExamActive = true;
        // Fix 1: In OBO mode, restart OBO timers instead of scroll-mode timer
        if (isOneByOneMode) {
          startOboOverallTimer();
          startOboQTimer();
        } else {
          startTimer();
        }
      }
    })
    .catch(function () {
      alert('Network error. Please check your WiFi and try again.');
      hasSubmitted = false;
      isExamActive = true;
      // Fix 1: In OBO mode, restart OBO timers instead of scroll-mode timer
      if (isOneByOneMode) {
        startOboOverallTimer();
        startOboQTimer();
      } else {
        startTimer();
      }
    });
}

function showSubmittedScreen(reason) {
  try {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) { }

  document.getElementById('submittedName').textContent =
    studentInfo.lastName + ', ' + studentInfo.firstName;

  var iconEl    = document.getElementById('submittedIcon');
  var headingEl = document.getElementById('submittedHeading');
  var noteEl    = document.getElementById('autoSubNote');

  if (reason === 'violation') {
    iconEl.textContent = '⚠️';
    headingEl.textContent = 'Exam Submitted — VIOLATION DETECTED!';
    noteEl.innerHTML = '<strong>⚠️ VIOLATION DETECTED!</strong><br/>Your exam was automatically submitted due to a violation.<br/><br/>This has been recorded and reported to your teacher.';
    noteEl.style.display = 'block';
    noteEl.style.background = '#fef2f2';
    noteEl.style.border = '1px solid #fecaca';
    noteEl.style.color = '#dc2626';
  } else if (reason === 'timer') {
    iconEl.textContent = '⏰';
    headingEl.textContent = 'Time is Up!';
    noteEl.innerHTML = '<strong>⏰ Your exam has been submitted automatically.</strong><br/>The time limit has expired.';
    noteEl.style.display = 'block';
    noteEl.style.background = '#fffbeb';
    noteEl.style.border = '1px solid #fde68a';
    noteEl.style.color = '#d97706';
  } else {
    iconEl.textContent = '✅';
    headingEl.textContent = 'Exam Submitted!';
    noteEl.style.display = 'none';
  }

  // Lock this device from retaking the exam
  if (examData && studentInfo.firstName) {
    markExamDone(examData.title, studentInfo.lastName + ', ' + studentInfo.firstName);
  }

  showScreen('submittedScreen');
}

// ─────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

// ─────────────────────────────────────────
//  ONE-TIME ACCESS — localStorage lock
// ─────────────────────────────────────────
function markExamDone(examTitle, studentName) {
  try {
    var key = 'exam_done_' + examTitle.toUpperCase().replace(/\s+/g, '_');
    localStorage.setItem(key, JSON.stringify({
      examTitle:   examTitle,
      studentName: studentName,
      submittedAt: new Date().toLocaleString()
    }));
  } catch (e) { }
}

function checkAlreadySubmitted(examTitle) {
  try {
    var key = 'exam_done_' + examTitle.toUpperCase().replace(/\s+/g, '_');
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { }
  return null;
}

function showAlreadySubmittedScreen(record) {
  var infoEl = document.getElementById('alreadySubmittedInfo');
  if (infoEl) {
    infoEl.innerHTML =
      '📋 Exam: <strong>' + escHtml(record.examTitle) + '</strong><br/>' +
      '👤 Name: <strong>' + escHtml(record.studentName) + '</strong><br/>' +
      '🕐 Submitted: ' + escHtml(record.submittedAt);
  }
  showScreen('alreadySubmittedScreen');
}

// ─────────────────────────────────────────
//  ATTENDANCE STATE
// ─────────────────────────────────────────
var attSessionId = null;
var attRecordId  = null;

var ATT_STORAGE_KEY = 'att_checkin_state';
var ATT_DEVICE_KEY  = 'att_device_id';

// Generate or retrieve a persistent device ID for this browser/device
function getAttDeviceId() {
  try {
    var id = localStorage.getItem(ATT_DEVICE_KEY);
    if (!id) {
      id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(ATT_DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    // localStorage unavailable — generate a session-only ID
    if (!window._attDeviceId) {
      window._attDeviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    return window._attDeviceId;
  }
}

function saveAttCheckinState(sessionId, recordId, sessionTitle, record) {
  try {
    localStorage.setItem(ATT_STORAGE_KEY, JSON.stringify({
      sessionId:    sessionId,
      recordId:     recordId,
      sessionTitle: sessionTitle,
      firstName:    record.firstName,
      lastName:     record.lastName,
      timeIn:       record.timeIn
    }));
  } catch (e) {}
}

function clearAttCheckinState() {
  try { localStorage.removeItem(ATT_STORAGE_KEY); } catch (e) {}
}

function loadAttCheckinState() {
  try {
    var raw = localStorage.getItem(ATT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// ─────────────────────────────────────────
//  ATTENDANCE — TIME IN
// ─────────────────────────────────────────
function attTimeIn() {
  var firstName = document.getElementById('attFirstName').value.trim().toUpperCase();
  var lastName  = document.getElementById('attLastName').value.trim().toUpperCase();
  var code      = document.getElementById('attCode').value.trim().toUpperCase();
  var errEl     = document.getElementById('attLoginError');
  var btn       = document.getElementById('attTimeInBtn');

  errEl.style.display = 'none';

  if (!firstName || !lastName || !code) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Checking in...';

  fetch('/api/attendance/timein', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: firstName,
      lastName:  lastName,
      code:      code,
      platform:  window.IS_NATIVE_APP ? 'app' : 'browser',
      deviceId:  getAttDeviceId()
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = '🕐 Time In';

      if (data.status === 'already_checked_in') {
        // Already timed in — restore state and go to checked-in screen
        attSessionId = data.sessionId;
        attRecordId  = data.record.id;
        // Persist so future reloads also restore correctly
        saveAttCheckinState(data.sessionId, data.record.id, data.sessionTitle, data.record);
        document.getElementById('checkedInName').textContent = data.record.lastName + ', ' + data.record.firstName;
        document.getElementById('checkedInSession').textContent = '📋 ' + data.sessionTitle;
        document.getElementById('checkedInTime').textContent = '🕐 Time In: ' + new Date(data.record.timeIn).toLocaleTimeString();
        showScreen('checkedInScreen');
        return;
      }

      if (data.status === 'already_completed') {
        errEl.textContent = '✅ You have already completed attendance for this session.';
        errEl.style.display = 'block';
        return;
      }

      if (!data.success) {
        errEl.textContent = data.error || 'Failed to check in. Please try again.';
        errEl.style.display = 'block';
        return;
      }

      // Success — store session/record IDs
      attSessionId = data.sessionId;
      attRecordId  = data.record.id;

      // Persist to localStorage so page reload restores state
      saveAttCheckinState(data.sessionId, data.record.id, data.sessionTitle, data.record);

      // Update checked-in screen
      document.getElementById('checkedInName').textContent = data.record.lastName + ', ' + data.record.firstName;
      document.getElementById('checkedInSession').textContent = '📋 ' + data.sessionTitle;
      document.getElementById('checkedInTime').textContent = '🕐 Time In: ' + new Date(data.record.timeIn).toLocaleTimeString();

      showScreen('checkedInScreen');
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = '🕐 Time In';
      errEl.textContent = 'Cannot connect to server. Make sure you are on the correct WiFi.';
      errEl.style.display = 'block';
    });
}

// ─────────────────────────────────────────
//  ATTENDANCE — TIME OUT
// ─────────────────────────────────────────
function attTimeOut() {
  var summary = document.getElementById('learningSummaryText').value.trim();
  var errEl   = document.getElementById('summaryError');
  var btn     = document.getElementById('attTimeOutBtn');

  errEl.style.display = 'none';

  if (!summary || summary.length < 10) {
    errEl.textContent = 'Please write at least a few words about what you learned today (minimum 10 characters).';
    errEl.style.display = 'block';
    return;
  }

  if (!attRecordId) {
    errEl.textContent = 'Session error. Please go back and time in again.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  fetch('/api/attendance/timeout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId:       attSessionId,
      recordId:        attRecordId,
      learningSummary: summary
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.textContent = '✅ Submit & Time Out';

      if (!data.success) {
        errEl.textContent = data.error || 'Failed to time out. Please try again.';
        errEl.style.display = 'block';
        return;
      }

      // Show done screen
      var r = data.record;
      document.getElementById('attDoneName').textContent = r.lastName + ', ' + r.firstName;
      document.getElementById('attDoneDetails').innerHTML =
        '📋 Session: <strong>' + escHtml(data.sessionTitle) + '</strong><br/>' +
        '🕐 Time In: <strong>' + new Date(r.timeIn).toLocaleTimeString() + '</strong><br/>' +
        '🚪 Time Out: <strong>' + new Date(r.timeOut).toLocaleTimeString() + '</strong><br/>' +
        '⏱ Duration: <strong>' + escHtml(r.duration) + '</strong><br/>' +
        (r.platform === 'app' ? '📱 <strong>App</strong>' : '🌐 <strong>Browser</strong>');

      // Clear persisted state
      clearAttCheckinState();
      attSessionId = null;
      attRecordId  = null;
      document.getElementById('learningSummaryText').value = '';
      document.getElementById('summaryCharCount').textContent = '0 characters';

      showScreen('attendanceDoneScreen');
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = '✅ Submit & Time Out';
      errEl.textContent = 'Network error. Please check your WiFi and try again.';
      errEl.style.display = 'block';
    });
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  setupNameFields();
  ['firstName', 'lastName', 'examCode'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') startExam(); });
  });

  // Attendance name fields — uppercase
  ['attFirstName', 'attLastName'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      try { this.setSelectionRange(pos, pos); } catch (e) {}
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') attTimeIn(); });
  });
  var attCodeEl = document.getElementById('attCode');
  if (attCodeEl) attCodeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') attTimeIn(); });

  // Learning summary character counter
  var summaryTA = document.getElementById('learningSummaryText');
  var charCount = document.getElementById('summaryCharCount');
  if (summaryTA && charCount) {
    summaryTA.addEventListener('input', function () {
      charCount.textContent = this.value.length + ' characters';
      charCount.style.color = this.value.length >= 10 ? '#16a34a' : '#94a3b8';
    });
  }

  // ── Restore attendance check-in state after page reload ──
  var savedAtt = loadAttCheckinState();
  if (savedAtt && savedAtt.sessionId && savedAtt.recordId) {
    attSessionId = savedAtt.sessionId;
    attRecordId  = savedAtt.recordId;
    document.getElementById('checkedInName').textContent    = savedAtt.lastName + ', ' + savedAtt.firstName;
    document.getElementById('checkedInSession').textContent = '📋 ' + (savedAtt.sessionTitle || '');
    document.getElementById('checkedInTime').textContent    = '🕐 Time In: ' + new Date(savedAtt.timeIn).toLocaleTimeString();
    showScreen('checkedInScreen');
  }

  // Fetch server deployment mode and update connection instructions
  fetchServerInfo();
});
