// Restored full student runtime with code+name login flow, exam rendering, submit, and proctoring

var studentInfo = { firstName: '', lastName: '', studentId: '' };
var examData = null;
var answers = [];
var answerMap = [];
var examStartedAt = null;
var examTimerInterval = null;
var remainingSeconds = 0;
var _isSubmitting = false;
var violationCount = 0;
var violationActive = false;
var violationPolicy = 'teacher_decides';
var fullscreenRetryTimer = null;
var violationPollTimer = null;

// one-by-one mode state
var oboIndex = 0;
var oboQuestionTimer = null;
var oboRemaining = 0;

// attendance state
var attendanceState = {
  sessionId: null,
  recordId: null,
  firstName: '',
  lastName: '',
  sessionTitle: ''
};

function byId(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  var el = byId(id);
  if (el) el.classList.add('active');
}
window.showScreen = showScreen;

function toggleStartBtn() {
  var cb = byId('agreeCheckbox');
  var btn = byId('startBtn');
  if (cb && btn) btn.disabled = !cb.checked;
}
window.toggleStartBtn = toggleStartBtn;

function splitSelectedName(fullName) {
  var parts = String(fullName || '').split(',');
  var lastName = (parts[0] || '').trim().toUpperCase();
  var firstName = (parts.slice(1).join(',') || '').trim().toUpperCase();
  return { firstName: firstName, lastName: lastName };
}

function setLoginError(msg) {
  var err = byId('loginError');
  if (!err) return;
  if (!msg) {
    err.style.display = 'none';
    err.textContent = '';
  } else {
    err.textContent = msg;
    err.style.display = 'block';
  }
}

function loadAllowedStudentsForCode() {
  var examCodeEl = byId('examCode');
  var select = byId('studentNameSelect');
  if (!examCodeEl || !select) return;

  var examCode = examCodeEl.value.trim().toUpperCase();
  setLoginError('');

  if (!examCode) {
    select.innerHTML = '<option value="">Enter exam code first to load names...</option>';
    return;
  }

  select.innerHTML = '<option value="">Loading student list...</option>';

  fetch('/api/exam/code/' + encodeURIComponent(examCode))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        examData = null;
        select.innerHTML = '<option value="">No names available</option>';
        setLoginError(data.message || data.error);
        return;
      }

      examData = data;
      var names = Array.isArray(data.allowedStudents) ? data.allowedStudents : [];
      if (names.length === 0) {
        select.innerHTML = '<option value="">No student names configured by teacher</option>';
        return;
      }

      select.innerHTML = '<option value="">Select your name...</option>';
      names.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    })
    .catch(function () {
      examData = null;
      select.innerHTML = '<option value="">Failed to load names</option>';
      setLoginError('Cannot load student list. Check connection and exam code.');
    });
}

function startExam() {
  var examCodeEl = byId('examCode');
  var select = byId('studentNameSelect');
  var btn = byId('startBtn');

  var examCode = examCodeEl ? examCodeEl.value.trim().toUpperCase() : '';
  var selectedName = select ? select.value : '';

  setLoginError('');

  if (!examCode) return setLoginError('Please enter the exam code.');
  if (!selectedName) return setLoginError('Please select your name from the list.');

  var parsed = splitSelectedName(selectedName);
  if (!parsed.firstName || !parsed.lastName) {
    return setLoginError('Selected name is not valid. Please choose again.');
  }

  if (!examData || !examData.id) {
    return setLoginError('Please load a valid exam code first.');
  }

  studentInfo = {
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    studentId: selectedName.toLowerCase().replace(/[^a-z0-9]/g, '_')
  };

  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }

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
      if (!data.success) {
        setLoginError(data.message || data.error || 'Failed to join exam.');
        if (btn) { btn.disabled = false; btn.textContent = 'Start Exam →'; }
        return;
      }

      violationPolicy = examData.violationPolicy || 'teacher_decides';
      initializeExamRuntime();
      requestExamFullscreen();
      startFullscreenEnforcer();

      if ((examData.questionMode || 'scroll') === 'one-by-one') {
        showScreen('oboScreen');
        renderOboQuestion();
      } else {
        showScreen('examScreen');
        renderQuestions();
      }
    })
    .catch(function () {
      setLoginError('Network error while joining exam.');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Exam →'; }
    });
}
window.startExam = startExam;

function requestExamFullscreen() {
  var docEl = document.documentElement;
  if (!docEl) return;
  var fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  if (fsElement) return;

  var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
  if (req) {
    try { req.call(docEl); } catch (e) {}
  }
}

function startFullscreenEnforcer() {
  if (fullscreenRetryTimer) clearInterval(fullscreenRetryTimer);
  fullscreenRetryTimer = setInterval(function () {
    if (!examData || _isSubmitting) return;
    requestExamFullscreen();
  }, 1500);
}

function stopFullscreenEnforcer() {
  if (fullscreenRetryTimer) {
    clearInterval(fullscreenRetryTimer);
    fullscreenRetryTimer = null;
  }
}

function initializeExamRuntime() {
  examStartedAt = Date.now();
  answers = new Array((examData.questions || []).length).fill(null);
  answerMap = examData._answerMap || [];
  remainingSeconds = Math.max(1, (parseInt(examData.timeLimit, 10) || 1) * 60);

  var titleBar = byId('examTitleBar');
  var nameBar = byId('studentNameBar');
  var idBar = byId('studentIdBar');
  var avatar = byId('studentAvatar');
  var oboTitle = byId('oboTitleBar');
  if (titleBar) titleBar.textContent = examData.title || 'Exam';
  if (oboTitle) oboTitle.textContent = examData.title || 'Exam';
  if (nameBar) nameBar.textContent = studentInfo.lastName + ', ' + studentInfo.firstName;
  if (idBar) idBar.textContent = studentInfo.studentId;
  if (avatar) avatar.textContent = (studentInfo.firstName.charAt(0) + studentInfo.lastName.charAt(0)).toUpperCase();

  updateProgressUI();
  startExamTimer();
  attachProctoringHandlers();
}

function fmt(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startExamTimer() {
  clearInterval(examTimerInterval);
  var timerBox = byId('timerBox');
  var oboOverall = byId('oboOverallTimer');

  function paint() {
    var txt = fmt(Math.max(0, remainingSeconds));
    if (timerBox) {
      timerBox.textContent = txt;
      timerBox.classList.toggle('warning', remainingSeconds <= 300 && remainingSeconds > 60);
      timerBox.classList.toggle('danger', remainingSeconds <= 60);
    }
    if (oboOverall) {
      oboOverall.textContent = txt;
      oboOverall.classList.toggle('warning', remainingSeconds <= 300 && remainingSeconds > 60);
      oboOverall.classList.toggle('danger', remainingSeconds <= 60);
    }
  }

  paint();
  examTimerInterval = setInterval(function () {
    remainingSeconds--;
    paint();
    if (remainingSeconds <= 0) {
      clearInterval(examTimerInterval);
      submitExam(true, false);
    }
  }, 1000);
}

function renderQuestions() {
  var area = byId('questionsArea');
  if (!area) return;
  var qs = examData.questions || [];
  area.innerHTML = '';

  if (!qs.length) {
    area.innerHTML = '<div class="q-card"><div class="q-text">No questions found for this exam.</div></div>';
    return;
  }

  qs.forEach(function (q, idx) {
    var card = document.createElement('div');
    card.className = 'q-card';
    card.id = 'qcard_' + idx;

    var typeLabel = q.type === 'mcq' ? 'MCQ' : (q.type === 'truefalse' ? 'TRUE/FALSE' : 'IDENTIFICATION');
    var typeCls = q.type === 'mcq' ? 'q-type-mcq' : (q.type === 'truefalse' ? 'q-type-tf' : 'q-type-id');

    var html = ''
      + '<div class="q-header">'
      + '  <div class="q-number">' + (idx + 1) + '</div>'
      + '  <span class="q-type-badge ' + typeCls + '">' + typeLabel + '</span>'
      + '  <div class="q-text">' + escapeHtml(q.question || '') + '</div>'
      + '</div>';

    if (q.type === 'mcq') {
      html += '<div class="mcq-options">';
      (q.options || []).forEach(function (opt, oi) {
        var letter = ['A', 'B', 'C', 'D'][oi] || String.fromCharCode(65 + oi);
        html += ''
          + '<div class="mcq-option" onclick="setMcqAnswer(' + idx + ',\'' + letter + '\', this)">'
          + '  <div class="option-circle"><div class="option-check"></div></div>'
          + '  <div class="option-lbl">' + letter + '.</div>'
          + '  <div>' + escapeHtml(opt || '') + '</div>'
          + '</div>';
      });
      html += '</div>';
    } else if (q.type === 'truefalse') {
      html += ''
        + '<div class="tf-options">'
        + '  <button class="tf-btn" type="button" onclick="setTfAnswer(' + idx + ',\'True\', this)">TRUE</button>'
        + '  <button class="tf-btn" type="button" onclick="setTfAnswer(' + idx + ',\'False\', this)">FALSE</button>'
        + '</div>';
    } else {
      html += '<input class="id-input" type="text" placeholder="Type your answer..." oninput="setIdAnswer(' + idx + ', this.value)"/>';
    }

    card.innerHTML = html;
    area.appendChild(card);
  });

  updateProgressUI();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '<')
    .replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&#39;');
}

function markAnswered(idx) {
  var c = byId('qcard_' + idx);
  if (c) c.classList.add('answered');
}

function setMcqAnswer(idx, letter, el) {
  answers[idx] = letter;
  var wrap = el && el.parentElement;
  if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll('.mcq-option'), function (n) { n.classList.remove('selected'); });
  if (el) el.classList.add('selected');
  markAnswered(idx);
  updateProgressUI();
}
window.setMcqAnswer = setMcqAnswer;

function setTfAnswer(idx, val, el) {
  answers[idx] = val;
  var wrap = el && el.parentElement;
  if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll('.tf-btn'), function (n) {
    n.classList.remove('selected-true');
    n.classList.remove('selected-false');
  });
  if (el) el.classList.add(val === 'True' ? 'selected-true' : 'selected-false');
  markAnswered(idx);
  updateProgressUI();
}
window.setTfAnswer = setTfAnswer;

function setIdAnswer(idx, val) {
  var v = String(val || '').trim();
  answers[idx] = v.length ? v : null;
  if (v.length) markAnswered(idx);
  updateProgressUI();
}
window.setIdAnswer = setIdAnswer;

function updateProgressUI() {
  var total = (examData && examData.questions ? examData.questions.length : 0);
  var answered = answers.filter(function (a) { return a !== null && a !== ''; }).length;

  var pt = byId('progressText');
  var pf = byId('progressFill');
  var sp = byId('submitProgress');
  if (pt) pt.textContent = answered + ' / ' + total + ' answered';
  if (pf) pf.style.width = (total ? Math.round((answered / total) * 100) : 0) + '%';
  if (sp) sp.textContent = answered + ' of ' + total + ' answered';
}

function confirmSubmit() {
  var m = byId('confirmModal');
  var msg = byId('confirmMsg');
  var total = answers.length;
  var answered = answers.filter(function (a) { return a !== null && a !== ''; }).length;
  if (msg) msg.textContent = 'Submit now? You answered ' + answered + ' of ' + total + ' questions.';
  if (m) m.classList.add('show');
}
window.confirmSubmit = confirmSubmit;

function closeConfirm() {
  var m = byId('confirmModal');
  if (m) m.classList.remove('show');
}
window.closeConfirm = closeConfirm;

function doSubmit() {
  closeConfirm();
  submitExam(false, violationActive === true);
}
window.doSubmit = doSubmit;

function submitExam(autoSubmitted, violationFlag) {
  if (_isSubmitting) return;
  stopFullscreenEnforcer();
  _isSubmitting = true;
  clearInterval(examTimerInterval);
  clearInterval(oboQuestionTimer);

  fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: studentInfo.firstName,
      lastName: studentInfo.lastName,
      studentId: studentInfo.studentId,
      examId: examData.id,
      answers: answers,
      answerMap: answerMap,
      autoSubmitted: !!autoSubmitted,
      violation: !!violationFlag,
      violationCount: violationCount,
      platform: window.IS_NATIVE_APP ? 'app' : 'browser'
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var submittedName = byId('submittedName');
      var autoSubNote = byId('autoSubNote');
      if (submittedName) submittedName.textContent = studentInfo.lastName + ', ' + studentInfo.firstName;
      if (autoSubNote) autoSubNote.style.display = autoSubmitted ? 'block' : 'none';
      showScreen('submittedScreen');
    })
    .catch(function () {
      showScreen('submittedScreen');
    });
}

function reportViolation(type) {
  if (!examData || !studentInfo.studentId || _isSubmitting) return;
  fetch('/api/violations/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: studentInfo.studentId,
      firstName: studentInfo.firstName,
      lastName: studentInfo.lastName,
      examId: examData.id,
      violationType: type || 'unknown'
    })
  }).catch(function () {});
}

function showViolationOverlay(type) {
  violationCount++;
  violationActive = true;
  var overlay = byId('warningOverlay');
  var msg = byId('violationTypeMsg');
  var cnt = byId('violationCountDisplay');
  var examScreen = byId('examScreen');
  var oboScreen = byId('oboScreen');

  if (msg) {
    if (type === 'visibility') msg.textContent = 'Violation detected: You switched tabs or minimized the app.';
    else if (type === 'fullscreen_exit') msg.textContent = 'Violation detected: Fullscreen mode was exited.';
    else msg.textContent = 'Violation detected: Suspicious behavior was found.';
  }
  if (cnt) cnt.textContent = String(violationCount);
  if (overlay) overlay.classList.add('show');
  if (examScreen) examScreen.classList.add('violation-blur');
  if (oboScreen) oboScreen.classList.add('violation-blur');

  updateViolationOverlayByPolicy();

  // Auto-submit threshold only for configured policy
  if (violationPolicy === 'auto_submit_3' && violationCount >= 3) {
    submitExam(true, true);
  }
}

function clearViolationOverlay() {
  violationActive = false;
  var overlay = byId('warningOverlay');
  var examScreen = byId('examScreen');
  var oboScreen = byId('oboScreen');
  if (overlay) overlay.classList.remove('show');
  if (examScreen) examScreen.classList.remove('violation-blur');
  if (oboScreen) oboScreen.classList.remove('violation-blur');
}

function updateViolationOverlayByPolicy() {
  var waitLabel = byId('violationWaitLabel');
  var btn = byId('violationContinueBtn');
  if (!btn || !waitLabel) return;

  if (violationPolicy === 'teacher_decides') {
    btn.style.display = 'none';
    waitLabel.textContent = 'Teacher is being notified';
  } else {
    btn.style.display = 'block';
    waitLabel.textContent = 'You may continue the exam';
  }
}

function continueAfterViolation() {
  if (violationPolicy === 'teacher_decides') return;
  clearViolationOverlay();
  requestExamFullscreen();
}
window.continueAfterViolation = continueAfterViolation;

function attachProctoringHandlers() {
  document.addEventListener('visibilitychange', function () {
    if (!examData || _isSubmitting) return;
    if (document.hidden) {
      reportViolation('visibility');
      showViolationOverlay('visibility');
    } else {
      clearViolationOverlay();
      requestExamFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', function () {
    if (!examData || _isSubmitting) return;
    var fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    if (!fsElement) {
      reportViolation('fullscreen_exit');
      showViolationOverlay('fullscreen_exit');
      requestExamFullscreen();
    }
  });

  if (violationPollTimer) clearInterval(violationPollTimer);
  violationPollTimer = setInterval(function () {
    if (!examData || _isSubmitting || !studentInfo.studentId) return;
    fetch('/api/violations/check?studentId=' + encodeURIComponent(studentInfo.studentId) + '&examId=' + encodeURIComponent(examData.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data) return;
        if (typeof data.violationCount === 'number') {
          violationCount = Math.max(violationCount, data.violationCount);
          var cnt = byId('violationCountDisplay');
          if (cnt) cnt.textContent = String(violationCount);
        }
        if (data.violationPolicy) {
          violationPolicy = data.violationPolicy;
          updateViolationOverlayByPolicy();
        }
        if (data.status === 'allowed') {
          clearViolationOverlay();
          requestExamFullscreen();
        } else if (data.status === 'force_submit') {
          submitExam(true, true);
        }
      })
      .catch(function () {});
  }, 1500);

  window.addEventListener('beforeunload', function () {
    if (!examData || _isSubmitting) return;
    navigator.sendBeacon('/api/submit/beacon', JSON.stringify({
      firstName: studentInfo.firstName,
      lastName: studentInfo.lastName,
      studentId: studentInfo.studentId,
      examId: examData.id,
      answers: answers,
      answerMap: answerMap,
      violation: violationActive === true,
      violationCount: violationCount,
      platform: window.IS_NATIVE_APP ? 'app' : 'browser'
    }));
  });
}

// one-by-one mode minimal implementation
function renderOboQuestion() {
  var qs = examData.questions || [];
  if (!qs.length) return submitExam(false, false);
  if (oboIndex >= qs.length) return submitExam(false, false);

  var q = qs[oboIndex];
  var num = oboIndex + 1;

  if (byId('oboQNum')) byId('oboQNum').textContent = String(num);
  if (byId('oboQTotal')) byId('oboQTotal').textContent = String(qs.length);
  if (byId('oboQNumBadge')) byId('oboQNumBadge').textContent = String(num);
  if (byId('oboQText')) byId('oboQText').textContent = q.question || '';
  if (byId('oboQTypeBadge')) byId('oboQTypeBadge').textContent = (q.type || '').toUpperCase();

  var area = byId('oboAnswerArea');
  if (!area) return;
  var html = '';

  if (q.type === 'mcq') {
    html += '<div class="mcq-options">';
    (q.options || []).forEach(function (opt, oi) {
      var letter = ['A', 'B', 'C', 'D'][oi] || String.fromCharCode(65 + oi);
      html += '<div class="mcq-option" onclick="setOboAnswer(\'' + letter + '\', this)"><div class="option-circle"><div class="option-check"></div></div><div class="option-lbl">' + letter + '.</div><div>' + escapeHtml(opt || '') + '</div></div>';
    });
    html += '</div>';
  } else if (q.type === 'truefalse') {
    html += '<div class="tf-options"><button class="tf-btn" type="button" onclick="setOboAnswer(\'True\', this)">TRUE</button><button class="tf-btn" type="button" onclick="setOboAnswer(\'False\', this)">FALSE</button></div>';
  } else {
    html += '<input class="id-input" type="text" placeholder="Type your answer..." oninput="setOboAnswer(this.value, this)"/>';
  }

  area.innerHTML = html;
  if (byId('oboNextBtn')) byId('oboNextBtn').disabled = true;
  if (byId('oboSubmitBtn')) byId('oboSubmitBtn').style.display = (num === qs.length ? 'inline-block' : 'none');
  startOboQuestionTimer();
}

function setOboAnswer(val, el) {
  var q = (examData.questions || [])[oboIndex] || {};
  var v = val;
  if (q.type === 'identification') v = String(val || '').trim();

  answers[oboIndex] = (v === '' ? null : v);

  if (q.type === 'mcq') {
    var wrap = el && el.parentElement;
    if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll('.mcq-option'), function (n) { n.classList.remove('selected'); });
    if (el) el.classList.add('selected');
  } else if (q.type === 'truefalse') {
    var twrap = el && el.parentElement;
    if (twrap) Array.prototype.forEach.call(twrap.querySelectorAll('.tf-btn'), function (n) {
      n.classList.remove('selected-true'); n.classList.remove('selected-false');
    });
    if (el) el.classList.add(String(v) === 'True' ? 'selected-true' : 'selected-false');
  }

  if (byId('oboNextBtn')) byId('oboNextBtn').disabled = false;
}
window.setOboAnswer = setOboAnswer;

function nextOboQuestion() {
  oboIndex++;
  if (oboIndex >= (examData.questions || []).length) return submitExam(false, false);
  renderOboQuestion();
}
window.nextOboQuestion = nextOboQuestion;

function startOboQuestionTimer() {
  clearInterval(oboQuestionTimer);
  oboRemaining = Math.max(5, parseInt(examData.timePerQuestion, 10) || 30);
  var t = byId('oboQTimer');

  function paint() {
    if (!t) return;
    t.textContent = fmt(oboRemaining);
    t.classList.toggle('warning', oboRemaining <= 10 && oboRemaining > 5);
    t.classList.toggle('danger', oboRemaining <= 5);
  }

  paint();
  oboQuestionTimer = setInterval(function () {
    oboRemaining--;
    paint();
    if (oboRemaining <= 0) {
      clearInterval(oboQuestionTimer);
      nextOboQuestion();
    }
  }, 1000);
}

// attendance
function attSetErr(msg) {
  var e = byId('attLoginError');
  if (!e) return;
  if (!msg) { e.style.display = 'none'; e.textContent = ''; return; }
  e.textContent = msg; e.style.display = 'block';
}

function attTimeIn() {
  var fn = String((byId('attFirstName') || {}).value || '').trim().toUpperCase();
  var ln = String((byId('attLastName') || {}).value || '').trim().toUpperCase();
  var code = String((byId('attCode') || {}).value || '').trim().toUpperCase();
  if (!fn || !ln || !code) return attSetErr('Please fill in first name, last name, and session code.');

  fetch('/api/attendance/timein', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: fn,
      lastName: ln,
      code: code,
      platform: window.IS_NATIVE_APP ? 'app' : 'browser'
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.success) return attSetErr(d.message || d.error || 'Time-in failed.');
      attendanceState.sessionId = d.sessionId;
      attendanceState.recordId = d.record && d.record.id;
      attendanceState.firstName = fn;
      attendanceState.lastName = ln;
      attendanceState.sessionTitle = d.sessionTitle || '';
      if (byId('checkedInName')) byId('checkedInName').textContent = ln + ', ' + fn;
      if (byId('checkedInSession')) byId('checkedInSession').textContent = d.sessionTitle || '';
      if (byId('checkedInTime')) byId('checkedInTime').textContent = new Date().toLocaleString();
      showScreen('checkedInScreen');
    })
    .catch(function () { attSetErr('Network error during time-in.'); });
}
window.attTimeIn = attTimeIn;

function attTimeOut() {
  var txt = String((byId('learningSummaryText') || {}).value || '').trim();
  var err = byId('summaryError');
  if (err) { err.style.display = 'none'; err.textContent = ''; }

  if (!attendanceState.sessionId || !attendanceState.recordId) {
    if (err) { err.textContent = 'Attendance session not found. Please time in again.'; err.style.display = 'block'; }
    return;
  }
  if (txt.length < 10) {
    if (err) { err.textContent = 'Please write a short learning summary (at least 10 characters).'; err.style.display = 'block'; }
    return;
  }

  fetch('/api/attendance/timeout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: attendanceState.sessionId,
      recordId: attendanceState.recordId,
      learningSummary: txt
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.success) {
        if (err) { err.textContent = d.error || 'Time-out failed.'; err.style.display = 'block'; }
        return;
      }
      if (byId('attDoneName')) byId('attDoneName').textContent = attendanceState.lastName + ', ' + attendanceState.firstName;
      if (byId('attDoneDetails')) byId('attDoneDetails').innerHTML =
        '<div><strong>Session:</strong> ' + escapeHtml(attendanceState.sessionTitle || '') + '</div>'
        + '<div><strong>Time In:</strong> ' + escapeHtml(new Date(d.record.timeIn).toLocaleString()) + '</div>'
        + '<div><strong>Time Out:</strong> ' + escapeHtml(new Date(d.record.timeOut).toLocaleString()) + '</div>'
        + '<div><strong>Duration:</strong> ' + escapeHtml(d.record.duration || '') + '</div>';
      showScreen('attendanceDoneScreen');
    })
    .catch(function () {
      if (err) { err.textContent = 'Network error during time-out.'; err.style.display = 'block'; }
    });
}
window.attTimeOut = attTimeOut;

document.addEventListener('DOMContentLoaded', function () {
  var examCodeEl = byId('examCode');
  if (examCodeEl) {
    examCodeEl.addEventListener('blur', loadAllowedStudentsForCode);
    examCodeEl.addEventListener('change', loadAllowedStudentsForCode);
    examCodeEl.addEventListener('keyup', function (e) { if (e.key === 'Enter') loadAllowedStudentsForCode(); });
  }

  var summaryText = byId('learningSummaryText');
  var summaryCount = byId('summaryCharCount');
  if (summaryText && summaryCount) {
    summaryText.addEventListener('input', function () {
      summaryCount.textContent = String(summaryText.value.length) + ' characters';
    });
  }
});
