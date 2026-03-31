// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
var questions = [];
var editingExamId = null;
var autoRefreshTimer = null;
var _confirmCallback = null;
var allExams = [];
var _isActionInProgress = false;

// Debug: Log when script loads
console.log('Teacher JS loaded successfully');

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
  console.log('DOM loaded, initializing...');
  setStudentURL();
  loadExamsList();
  startAutoRefresh();
  attachEventListeners();
});

function setStudentURL() {
  var host = window.location.hostname;
  var port = window.location.port || '3000';
  var url = host + ':' + port;
  document.getElementById('ipBadge').textContent = '📡 ' + url;
}

// ─────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────
function attachEventListeners() {
  // Tab buttons
  document.getElementById('tab-exams').addEventListener('click', function() { switchTab('exams'); });
  document.getElementById('tab-builder').addEventListener('click', function() { switchTab('builder'); });
  document.getElementById('tab-results').addEventListener('click', function() { switchTab('results'); });
  document.getElementById('tab-settings').addEventListener('click', function() { switchTab('settings'); });
  
  // Create new exam button
  var newExamBtn = document.querySelector('#panel-exams .btn-primary');
  if (newExamBtn) newExamBtn.addEventListener('click', newExam);
  
  // Back to exams button in builder
  var backBtns = document.querySelectorAll('#panel-builder .btn-outline');
  backBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab('exams'); });
  });
  
  // Save exam button
  var saveBtn = document.querySelector('#panel-builder .btn-success');
  if (saveBtn) saveBtn.addEventListener('click', saveExam);
  
  // Question type buttons
  var mcqBtn = document.querySelector('.btn-mcq');
  if (mcqBtn) mcqBtn.addEventListener('click', function() { addQuestion('mcq'); });
  var tfBtn = document.querySelector('.btn-tf');
  if (tfBtn) tfBtn.addEventListener('click', function() { addQuestion('truefalse'); });
  var idBtn = document.querySelector('.btn-id');
  if (idBtn) idBtn.addEventListener('click', function() { addQuestion('identification'); });
  var clearAllBtn = document.querySelector('.btn-outline');
  if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllQuestions);
  
  // Results tab buttons
  var exportBtn = document.querySelector('#panel-results .btn-success');
  if (exportBtn) exportBtn.addEventListener('click', exportExcel);
  var clearBtn = document.querySelector('#panel-results .btn-danger');
  if (clearBtn) clearBtn.addEventListener('click', clearResults);
  
  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(function(btn) {
    btn.addEventListener('click', closeModal);
  });
  
  // Confirm modal buttons
  var cancelBtn = document.querySelector('#confirmModal .btn-outline');
  if (cancelBtn) cancelBtn.onclick = closeConfirmModal;
  
  var okBtn = document.getElementById('confirmOkBtn');
  if (okBtn) {
    okBtn.onclick = function() {
      var callback = _confirmCallback;
      closeConfirmModal();
      setTimeout(function() { if (callback) callback(); }, 100);
    };
  }
  
  // Modal overlay click to close
  document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('confirmModal').addEventListener('click', function(e) {
    if (e.target === this) closeConfirmModal();
  });
}

// ─────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'results') { loadResultsExamFilter(); loadResults(); }
  if (name === 'exams') loadExamsList();
  if (name === 'violations') loadLiveMonitor();
  if (name === 'attendance') loadAttendanceSessions();
}

// ─────────────────────────────────────────
//  MY EXAMS TAB
// ─────────────────────────────────────────
function loadExamsList() {
  if (_isActionInProgress) return;
  
  fetch('/api/exams')
    .then(function(r) { return r.json(); })
    .then(function(exams) {
      allExams = exams;
      var container = document.getElementById('examsList');
      container.innerHTML = '';

      if (exams.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div>No exams yet. Click <strong>Create New Exam</strong> to get started.</div></div>';
        return;
      }

      exams.forEach(function(exam) {
        var card = document.createElement('div');
        var isActive = exam.active === true;
        card.className = 'exam-card ' + (isActive ? 'is-active' : 'is-inactive');

        var created = new Date(exam.createdAt).toLocaleDateString();
        
        // Student limit display
        var limitHtml = '';
        if (exam.maxStudents > 0) {
          var pct = Math.round((exam.submissionCount / exam.maxStudents) * 100);
          var color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
          limitHtml = '<span style="color:' + color + '" title="Student Limit">👥 ' + exam.submissionCount + ' / ' + exam.maxStudents + '</span>';
        } else {
          limitHtml = '<span title="No Limit">👥 ' + exam.submissionCount + '</span>';
        }

        var liveHtml = exam.liveCount > 0 ? '<span class="live-badge"><span class="live-dot"></span>' + exam.liveCount + ' online</span>' : '';
        var statusBadge = isActive ? '<span class="badge-active"><span class="badge-dot"></span>Active</span>' : '<span class="badge-inactive"><span class="badge-dot"></span>Inactive</span>';
        var toggleText = isActive ? '⏸ Deactivate' : '▶️ Activate';
        var toggleClass = isActive ? 'btn-deactivate' : 'btn-activate';

        card.innerHTML =
          '<div class="exam-card-info">' +
            '<div class="exam-code-badge">🔑 ' + escHtml(exam.title) + ' ' + statusBadge + '</div>' +
            '<div class="exam-card-title">' + escHtml(exam.title) + '</div>' +
            '<div class="exam-card-meta">' +
              '<span>📝 ' + (exam.questions ? exam.questions.length : 0) + ' questions</span>' +
              '<span>⏱ ' + exam.timeLimit + ' min</span>' +
              limitHtml +
              '<span>📅 ' + created + '</span>' +
              liveHtml +
            '</div>' +
          '</div>' +
          '<div class="exam-card-actions">' +
            '<button class="btn-view" data-action="view" data-id="' + exam.id + '">📊 Results</button>' +
            '<button class="btn-edit" data-action="edit" data-id="' + exam.id + '">✏️ Edit</button>' +
            '<button class="btn-dup" data-action="duplicate" data-id="' + exam.id + '" data-title="' + escHtml(exam.title) + '">📋 Duplicate</button>' +
            '<button class="' + toggleClass + '" data-action="toggle" data-id="' + exam.id + '">' + toggleText + '</button>' +
            '<button class="btn-del" data-action="delete" data-id="' + exam.id + '" data-title="' + escHtml(exam.title) + '">🗑 Delete</button>' +
          '</div>';

        container.appendChild(card);
      });

      attachExamCardListeners();
    })
    .catch(function() { showToast('Failed to load exams.', 'error'); });
}

function attachExamCardListeners() {
  var container = document.getElementById('examsList');
  var buttons = container.querySelectorAll('button');
  buttons.forEach(function(btn) {
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      var action = this.getAttribute('data-action');
      var id = this.getAttribute('data-id');
      var title = this.getAttribute('data-title');

      if (action === 'view') viewExamResults(id);
      else if (action === 'edit') editExam(id);
      else if (action === 'duplicate') duplicateExam(id, title);
      else if (action === 'toggle') toggleExam(id);
      else if (action === 'delete') deleteExam(id, title);
    };
  });
}

function newExam() {
  editingExamId = null;
  questions = [];
  document.getElementById('examTitle').value = '';
  document.getElementById('examTime').value = '60';
  document.getElementById('examMaxStudents').value = '0';
  document.getElementById('examQuestionMode').value = 'scroll';
  document.getElementById('examTimePerQuestion').value = '30';
  var tpqGroup = document.getElementById('timePerQuestionGroup');
  if (tpqGroup) tpqGroup.style.display = 'none';
  updateUsageDisplay(0, 0);
  document.getElementById('builderTitle').textContent = 'Create New Exam';
  document.getElementById('builderSub').textContent = 'Fill in the details and add questions below';
  renderQuestions();
  switchTab('builder');
}

// Show/hide the "Time per Question" field based on selected mode
function toggleQuestionMode() {
  var mode = document.getElementById('examQuestionMode').value;
  var tpqGroup = document.getElementById('timePerQuestionGroup');
  if (tpqGroup) tpqGroup.style.display = mode === 'one-by-one' ? 'flex' : 'none';
}

function editExam(id) {
  _isActionInProgress = true;
  fetch('/api/exams/' + id)
    .then(function(r) { return r.json(); })
    .then(function(exam) {
      editingExamId = id;
      // Normalize identification answers to arrays for backward compatibility
      questions = (exam.questions || []).map(function(q) {
        if (q.type === 'identification' && !Array.isArray(q.answer)) {
          return Object.assign({}, q, { answer: q.answer ? [String(q.answer)] : [''] });
        }
        return q;
      });
      document.getElementById('examTitle').value = exam.title;
      document.getElementById('examTime').value = exam.timeLimit;
      document.getElementById('examMaxStudents').value = exam.maxStudents || 0;
      document.getElementById('examQuestionMode').value = exam.questionMode || 'scroll';
      document.getElementById('examTimePerQuestion').value = exam.timePerQuestion || 30;
      var tpqGroup = document.getElementById('timePerQuestionGroup');
      if (tpqGroup) tpqGroup.style.display = (exam.questionMode === 'one-by-one') ? 'flex' : 'none';
      updateUsageDisplay(exam.submissionCount || 0, exam.maxStudents || 0);
      document.getElementById('builderTitle').textContent = 'Edit Exam';
      document.getElementById('builderSub').textContent = 'Code: ' + exam.title;
      renderQuestions();
      switchTab('builder');
    })
    .catch(function() { showToast('Failed to load exam.', 'error'); })
    .finally(function() { _isActionInProgress = false; });
}

function updateUsageDisplay(current, max) {
  var display = document.getElementById('currentUsageDisplay');
  if (max > 0) {
    display.textContent = current + ' / ' + max;
    display.style.color = current >= max ? '#ef4444' : '#15803d';
  } else {
    display.textContent = current + ' (No limit)';
    display.style.color = '#15803d';
  }
}

function deleteExam(id, title) {
  _isActionInProgress = true;
  showConfirm('Delete Exam', 'Delete "' + title + '"? All submissions will also be deleted.', 'danger', function() {
    fetch('/api/exams/' + id, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) { showToast(data.message, 'success'); loadExamsList(); }
        else showToast(data.error || 'Failed.', 'error');
      })
      .catch(function() { showToast('Network error.', 'error'); })
      .finally(function() { _isActionInProgress = false; });
  });
  setTimeout(function() { if (_isActionInProgress) _isActionInProgress = false; }, 2000);
}

function duplicateExam(id, title) {
  _isActionInProgress = true;
  fetch('/api/exams/' + id + '/duplicate', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        showToast(data.message, 'success');
        loadExamsList();
        // Open the duplicate in the editor so teacher can rename it (e.g. "Set B")
        setTimeout(function() { editExam(data.exam.id); }, 400);
      } else {
        showToast(data.error || 'Failed to duplicate.', 'error');
      }
    })
    .catch(function() { showToast('Network error.', 'error'); })
    .finally(function() { _isActionInProgress = false; });
}

function toggleExam(id) {
  _isActionInProgress = true;
  fetch('/api/exams/' + id + '/toggle', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) { showToast(data.message, 'success'); loadExamsList(); }
      else showToast(data.error || 'Failed.', 'error');
    })
    .catch(function() { showToast('Network error.', 'error'); })
    .finally(function() { _isActionInProgress = false; });
}

function viewExamResults(id) {
  loadResultsExamFilter(id);
  switchTab('results');
}

// ─────────────────────────────────────────
//  QUESTION BUILDER
// ─────────────────────────────────────────
function addQuestion(type) {
  // Identification uses an array of accepted answers; others use a string
  var defaultAnswer = type === 'identification' ? [''] : '';
  var question = {
    type: type,
    question: '',
    answer: defaultAnswer,
    options: type === 'mcq' ? ['', '', '', ''] : null
  };

  // Coding questions have extra fields
  if (type === 'coding') {
    question.codeTemplate = '// Write your code here\n';
    question.language = 'javascript';
    question.expectedOutput = '';
    question.input = '';
    question.langHelp = '';
    // For SQL: optional database schema/seed
    question.databaseSchema = '';
  }

  questions.push(question);
  renderQuestions();
}

function removeQuestion(idx) {
  questions.splice(idx, 1);
  renderQuestions();
}

function setQuestionText(idx, val) { questions[idx].question = val; }
function setAnswer(idx, val) { questions[idx].answer = val; }
function setOption(idx, oi, val) { questions[idx].options[oi] = val; }

// Test a coding question's code against expected output
async function testCodingQuestion(idx) {
  var q = questions[idx];
  if (!q.codeTemplate) {
    showToast('Please enter code in the template.', 'error');
    return;
  }
  var resultDiv = document.getElementById('coding-test-' + idx);
  var outputEl = document.getElementById('test-output-' + idx);
  var matchEl = document.getElementById('test-match-' + idx);
  if (!resultDiv || !outputEl) return;

  resultDiv.style.display = 'block';
  outputEl.textContent = '⏳ Running...';
  if (matchEl) matchEl.textContent = '';

  try {
    var resp = await fetch('/api/run-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: q.codeTemplate,
        language: q.language,
        input: q.input || '',
        examId: 'test',
        questionId: idx
      })
    });
    var data = await resp.json();

    if (data.error) {
      outputEl.textContent = '❌ ' + data.error;
      outputEl.style.color = '#dc2626';
      outputEl.style.background = '#fef2f2';
      if (matchEl) matchEl.textContent = '❌ Failed to run';
    } else {
      outputEl.textContent = data.output || '(no output)';
      outputEl.style.color = '#1e293b';
      outputEl.style.background = '#1e293b';

      var expected = (q.expectedOutput || '').trim();
      var actual = (data.output || '').trim();
      var isMatch = actual === expected;

      if (matchEl) {
        matchEl.textContent = isMatch ? '✅ Output matches expected!' : '⚠️ Output does not match expected';
        matchEl.style.color = isMatch ? '#16a34a' : '#d97706';
      }
    }
  } catch (err) {
    outputEl.textContent = '❌ Network error: ' + err.message;
    outputEl.style.color = '#dc2626';
    outputEl.style.background = '#fef2f2';
    if (matchEl) matchEl.textContent = '❌';
  }
}

function renderQuestions() {
  var container = document.getElementById('questionsContainer');
  var countLabel = document.getElementById('qCountLabel');
  countLabel.textContent = questions.length + ' question' + (questions.length !== 1 ? 's' : '');

  if (questions.length === 0) {
    container.innerHTML = '<div id="noQuestionsMsg" class="empty-state"><div class="empty-icon">❓</div><div>No questions yet.</div></div>';
    return;
  }

  container.innerHTML = '';
  questions.forEach(function(q, i) {
    var div = document.createElement('div');
    div.className = 'q-card';

    var typeLabel = q.type === 'mcq' ? 'Multiple Choice' : q.type === 'truefalse' ? 'True / False' : 'Identification';
    var typeColor = q.type === 'mcq' ? '#2563eb' : q.type === 'truefalse' ? '#16a34a' : '#9333ea';
    var typeBg = q.type === 'mcq' ? '#eff6ff' : q.type === 'truefalse' ? '#f0fdf4' : '#fdf4ff';

    var header = document.createElement('div');
    header.className = 'q-card-header';
    header.innerHTML = '<div class="q-num"><span style="background:' + typeBg + ';color:' + typeColor + ';padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:700">' + typeLabel + '</span> Q' + (i + 1) + '</div><button class="q-delete" data-idx="' + i + '">🗑 Remove</button>';
    div.appendChild(header);
    header.querySelector('.q-delete').addEventListener('click', function() { removeQuestion(parseInt(this.getAttribute('data-idx'))); });

    var qGroup = document.createElement('div');
    qGroup.className = 'form-group';
    qGroup.innerHTML = '<label>Question Text *</label>';
    var qTA = document.createElement('textarea');
    qTA.placeholder = 'Enter your question here...';
    qTA.value = q.question;
    qTA.setAttribute('data-idx', i);
    qTA.addEventListener('input', function() { setQuestionText(parseInt(this.getAttribute('data-idx')), this.value); });
    qGroup.appendChild(qTA);
    div.appendChild(qGroup);

    if (q.type === 'mcq') {
      var optGroup = document.createElement('div');
      optGroup.className = 'form-group';
      optGroup.innerHTML = '<label>Answer Options</label>';
      var grid = document.createElement('div');
      grid.className = 'options-grid';
      ['A', 'B', 'C', 'D'].forEach(function(lbl, oi) {
        var row = document.createElement('div');
        row.className = 'option-row';
        var span = document.createElement('span');
        span.className = 'option-label';
        span.textContent = lbl + '.';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Option ' + lbl;
        inp.value = q.options[oi] || '';
        inp.setAttribute('data-qi', i);
        inp.setAttribute('data-oi', oi);
        inp.addEventListener('input', function() { setOption(parseInt(this.getAttribute('data-qi')), parseInt(this.getAttribute('data-oi')), this.value); });
        row.appendChild(span);
        row.appendChild(inp);
        grid.appendChild(row);
      });
      optGroup.appendChild(grid);
      div.appendChild(optGroup);

      var ansGroup = document.createElement('div');
      ansGroup.className = 'form-group';
      ansGroup.innerHTML = '<label>Correct Answer</label>';
      var sel = document.createElement('select');
      sel.setAttribute('data-idx', i);
      sel.innerHTML = '<option value="">-- Select --</option>' + ['A', 'B', 'C', 'D'].map(function(l) { return '<option value="' + l + '"' + (q.answer === l ? ' selected' : '') + '>' + l + '</option>'; }).join('');
      sel.addEventListener('change', function() { setAnswer(parseInt(this.getAttribute('data-idx')), this.value); });
      ansGroup.appendChild(sel);
      div.appendChild(ansGroup);
    } else if (q.type === 'truefalse') {
      var tfGroup = document.createElement('div');
      tfGroup.className = 'form-group';
      tfGroup.innerHTML = '<label>Correct Answer</label>';
      var tfSel = document.createElement('select');
      tfSel.setAttribute('data-idx', i);
      tfSel.innerHTML = '<option value="">-- Select --</option><option value="True"' + (q.answer === 'True' ? ' selected' : '') + '>True</option><option value="False"' + (q.answer === 'False' ? ' selected' : '') + '>False</option>';
      tfSel.addEventListener('change', function() { setAnswer(parseInt(this.getAttribute('data-idx')), this.value); });
      tfGroup.appendChild(tfSel);
      div.appendChild(tfGroup);
    } else {
      // ── IDENTIFICATION: multiple accepted answers ──
      var idGroup = document.createElement('div');
      idGroup.className = 'form-group';
      idGroup.innerHTML = '<label>Accepted Answers <span style="font-weight:400;color:#64748b">(case-insensitive — any one is correct)</span></label>';

      // Ensure answer is always an array
      if (!Array.isArray(q.answer)) q.answer = q.answer ? [String(q.answer)] : [''];

      var answersContainer = document.createElement('div');
      answersContainer.setAttribute('data-id-answers', i);
      answersContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px';

      function renderIdAnswers(qi, cont) {
        if (!cont) cont = document.querySelector('[data-id-answers="' + qi + '"]');
        if (!cont) return;
        cont.innerHTML = '';
        var arr = questions[qi].answer;
        arr.forEach(function(ans, ai) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px;align-items:center';

          var inp = document.createElement('input');
          inp.type = 'text';
          inp.placeholder = 'Accepted answer ' + (ai + 1) + '...';
          inp.value = ans;
          inp.style.cssText = 'flex:1;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit;color:#1e293b';
          inp.setAttribute('data-qi', qi);
          inp.setAttribute('data-ai', ai);
          inp.addEventListener('input', function() {
            var qIdx = parseInt(this.getAttribute('data-qi'));
            var aIdx = parseInt(this.getAttribute('data-ai'));
            questions[qIdx].answer[aIdx] = this.value;
          });

          var removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = '✕';
          removeBtn.title = 'Remove this answer';
          removeBtn.style.cssText = 'padding:8px 12px;border:1.5px solid #fecaca;border-radius:8px;background:#fef2f2;color:#dc2626;font-weight:700;cursor:pointer;font-size:.85rem;flex-shrink:0';
          removeBtn.disabled = arr.length <= 1;
          removeBtn.style.opacity = arr.length <= 1 ? '.35' : '1';
          removeBtn.setAttribute('data-qi', qi);
          removeBtn.setAttribute('data-ai', ai);
          removeBtn.addEventListener('click', function() {
            var qIdx = parseInt(this.getAttribute('data-qi'));
            var aIdx = parseInt(this.getAttribute('data-ai'));
            if (questions[qIdx].answer.length <= 1) return;
            questions[qIdx].answer.splice(aIdx, 1);
            renderIdAnswers(qIdx);
          });

          row.appendChild(inp);
          row.appendChild(removeBtn);
          cont.appendChild(row);
        });

        // Add Answer button
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '＋ Add Another Accepted Answer';
        addBtn.style.cssText = 'align-self:flex-start;padding:7px 14px;border:1.5px dashed #9333ea;border-radius:8px;background:#fdf4ff;color:#9333ea;font-weight:600;cursor:pointer;font-size:.82rem;margin-top:2px';
        addBtn.setAttribute('data-qi', qi);
        addBtn.addEventListener('click', function() {
          var qIdx = parseInt(this.getAttribute('data-qi'));
          questions[qIdx].answer.push('');
          renderIdAnswers(qIdx);
        });
        cont.appendChild(addBtn);
      }

      idGroup.appendChild(answersContainer);
      renderIdAnswers(i, answersContainer);
      div.appendChild(idGroup);
    } else if (q.type === 'coding') {
      // ── CODING QUESTION FIELDS ──
      var codingGroup = document.createElement('div');
      codingGroup.style.cssText = 'background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; padding:16px; margin-top:12px';

      // Language selector
      var langRow = document.createElement('div');
      langRow.style.cssText = 'display:flex; gap:12px; margin-bottom:12px';
      langRow.innerHTML = '<label style="font-size:.85rem;font-weight:600;color:#334155;min-width:80px">Language</label>' +
        '<select data-idx-lang="' + i + '" style="flex:1;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.9rem;">' +
        ['<option value="javascript">JavaScript</option>',
         '<option value="python">Python</option>',
         '<option value="java">Java</option>',
         '<option value="c">C</option>',
         '<option value="cpp">C++</option>',
         '<option value="csharp">C#</option>',
         '<option value="sql">SQL</option>'].join('') +
        '</select>';
      langRow.querySelector('select').value = q.language || 'javascript';
      langRow.querySelector('select').addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-idx-lang'));
        questions[idx].language = this.value;
        // Show/hide SQL schema field
        var schemaRow = document.getElementById('sql-schema-' + idx);
        if (schemaRow) schemaRow.style.display = (this.value === 'sql') ? 'block' : 'none';
      });
      codingGroup.appendChild(langRow);

      // Code template
      var codeGroup = document.createElement('div');
      codeGroup.className = 'form-group';
      codeGroup.innerHTML = '<label>Code Template (starting code for students)</label>';
      var codeTA = document.createElement('textarea');
      codeTA.rows = 8;
      codeTA.value = q.codeTemplate || '';
      codeTA.style.cssText = 'font-family:Consolas,Monaco,monospace; font-size:14px; width:100%; padding:10px; border:1.5px solid #cbd5e1; border-radius:8px; background:#1e293b; color:#e2e8f0; resize:vertical';
      codeTA.setAttribute('data-idx-code', i);
      codeTA.addEventListener('input', function() {
        questions[parseInt(this.getAttribute('data-idx-code'))].codeTemplate = this.value;
      });
      codeGroup.appendChild(codeTA);
      codingGroup.appendChild(codeGroup);

      // Input (stdin)
      var inputGroup = document.createElement('div');
      inputGroup.className = 'form-group';
      inputGroup.innerHTML = '<label>Input (stdin) — optional</label>';
      var inputTA = document.createElement('textarea');
      inputTA.rows = 2;
      inputTA.value = q.input || '';
      inputTA.placeholder = 'Standard input for the program, e.g., "2 3" or "Hello"';
      inputTA.style.cssText = 'width:100%; padding:10px; border:1.5px solid #e2e8f0; border-radius:8px; font-family:monospace';
      inputTA.setAttribute('data-idx-input', i);
      inputTA.addEventListener('input', function() {
        questions[parseInt(this.getAttribute('data-idx-input'))].input = this.value;
      });
      inputGroup.appendChild(inputTA);
      codingGroup.appendChild(inputGroup);

      // Expected output
      var expGroup = document.createElement('div');
      expGroup.className = 'form-group';
      expGroup.innerHTML = '<label>Expected Output * (exact match required)</label>';
      var expInput = document.createElement('input');
      expInput.type = 'text';
      expInput.value = q.expectedOutput || '';
      expInput.placeholder = 'What the program should print';
      expInput.style.cssText = 'width:100%; padding:10px; border:1.5px solid #e2e8f0; border-radius:8px';
      expInput.setAttribute('data-idx-exp', i);
      expInput.addEventListener('input', function() {
        questions[parseInt(this.getAttribute('data-idx-exp'))].expectedOutput = this.value;
      });
      expGroup.appendChild(expInput);
      codingGroup.appendChild(expGroup);

      // Language-specific help (optional)
      var helpGroup = document.createElement('div');
      helpGroup.className = 'form-group';
      helpGroup.innerHTML = '<label>Language-Specific Instructions (optional)</label>';
      var helpTA = document.createElement('textarea');
      helpTA.rows = 2;
      helpTA.value = q.langHelp || '';
      helpTA.placeholder = 'e.g., "Implement a function called add() that takes two parameters and returns the sum"';
      helpTA.style.cssText = 'width:100%; padding:10px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:.9rem';
      helpTA.setAttribute('data-idx-help', i);
      helpTA.addEventListener('input', function() {
        questions[parseInt(this.getAttribute('data-idx-help'))].langHelp = this.value;
      });
      helpGroup.appendChild(helpTA);
      codingGroup.appendChild(helpGroup);

      // Test code button
      var testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.textContent = '🧪 Test Code';
      testBtn.style.cssText = 'padding:10px 20px; background:#7c3aed; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600; margin-top:8px';
      testBtn.setAttribute('data-idx-test', i);
      testBtn.addEventListener('click', function() {
        testCodingQuestion(parseInt(this.getAttribute('data-idx-test')));
      });
      codingGroup.appendChild(testBtn);

      // Test result area
      var testResult = document.createElement('div');
      testResult.id = 'coding-test-' + i;
      testResult.style.cssText = 'margin-top:10px; padding:10px; background:#f1f5f9; border-radius:8px; display:none';
      testResult.innerHTML = '<div style="font-weight:600; margin-bottom:6px;">Test Result</div><pre id="test-output-' + i + '" style="background:#1e293b; color:#22c55e; padding:10px; border-radius:6px; margin:0; font-family:monospace; font-size:13px; max-height:200px; overflow:auto"></pre><div id="test-match-' + i + '" style="margin-top:6px; font-size:.9rem;"></div>';
      codingGroup.appendChild(testResult);

      // SQL: Database schema (shown only for SQL)
      var sqlSchema = document.createElement('div');
      sqlSchema.id = 'sql-schema-' + i;
      sqlSchema.style.cssText = 'margin-top:12px; display:' + (q.language === 'sql' ? 'block' : 'none');
      sqlSchema.innerHTML = '<label style="display:block;font-size:.85rem;font-weight:600;color:#334155;margin-bottom:6px">Database Schema & Seed Data <span style="font-weight:400;color:#64748b">(for SQL questions)</span></label>' +
        '<textarea data-idx-sql="' + i + '" rows="4" style="width:100%; font-family:monospace; font-size:13px; padding:10px; border:1.5px solid #93c5fd; border-radius:8px; background:#f0f9ff; color:#1e40af" placeholder="CREATE TABLE students (id INTEGER, name TEXT, grade INTEGER);\nINSERT INTO students VALUES (1, \'Alice\', 95);">' + (q.databaseSchema || '') + '</textarea>' +
        '<div style="font-size:.82rem;color:#64748b;margin-top:4px">Define tables and seed data. The database will be reset for each test run.</div>';
      sqlSchema.querySelector('textarea').addEventListener('input', function() {
        questions[parseInt(this.getAttribute('data-idx-sql'))].databaseSchema = this.value;
      });
      codingGroup.appendChild(sqlSchema);

      div.appendChild(codingGroup);
    }

    container.appendChild(div);
  });
}

function clearAllQuestions() {
  if (questions.length === 0) return;
  showConfirm('Clear All Questions', 'Remove all ' + questions.length + ' questions?', 'danger', function() {
    questions = [];
    renderQuestions();
  });
}

// ─────────────────────────────────────────
//  SAVE EXAM
// ─────────────────────────────────────────
function saveExam() {
  var title = document.getElementById('examTitle').value.trim();
  var timeLimit = parseInt(document.getElementById('examTime').value);
  var maxStudents = parseInt(document.getElementById('examMaxStudents').value);
  var questionMode = document.getElementById('examQuestionMode').value || 'scroll';
  var timePerQuestion = parseInt(document.getElementById('examTimePerQuestion').value) || 30;

  if (!title) { showToast('Please enter an exam title.', 'error'); return; }
  if (!timeLimit || timeLimit < 1) { showToast('Please enter a valid time limit.', 'error'); return; }
  if (questionMode === 'one-by-one' && (timePerQuestion < 5 || timePerQuestion > 600)) {
    showToast('Time per question must be between 5 and 600 seconds.', 'error'); return;
  }
  if (questions.length === 0) { showToast('Please add at least one question.', 'error'); return; }

  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (!q.question.trim()) { showToast('Question ' + (i + 1) + ' has no text.', 'error'); return; }
    if (q.type === 'coding') {
      if (!q.codeTemplate || !q.codeTemplate.trim()) { showToast('Question ' + (i + 1) + ': Code template is required.', 'error'); return; }
      if (!q.expectedOutput || !q.expectedOutput.trim()) { showToast('Question ' + (i + 1) + ': Expected output is required.', 'error'); return; }
      if (!q.language) { showToast('Question ' + (i + 1) + ': Language must be selected.', 'error'); return; }
    } else if (!q.answer) {
      showToast('Question ' + (i + 1) + ': set the correct answer.', 'error'); return;
    }
    if (q.type === 'mcq') {
      for (var oi = 0; oi < 4; oi++) {
        if (!q.options[oi] || !q.options[oi].trim()) {
          showToast('Question ' + (i + 1) + ': Option ' + ['A', 'B', 'C', 'D'][oi] + ' is empty.', 'error');
          return;
        }
      }
    }
  }

  var url = editingExamId ? '/api/exams/' + editingExamId : '/api/exam/create';
  var method = editingExamId ? 'PUT' : 'POST';

  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title,
      timeLimit: timeLimit,
      maxStudents: maxStudents,
      questionMode: questionMode,
      timePerQuestion: timePerQuestion,
      questions: questions
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        showToast(data.message, 'success');
        editingExamId = null;
        questions = [];
        switchTab('exams');
      } else {
        showToast(data.error || 'Failed to save.', 'error');
      }
    })
    .catch(function() { showToast('Network error.', 'error'); });
}

// ─────────────────────────────────────────
//  RESULTS TAB
// ─────────────────────────────────────────
function loadResultsExamFilter(selectId) {
  fetch('/api/exams')
    .then(function(r) { return r.json(); })
    .then(function(exams) {
      var sel = document.getElementById('resultsExamFilter');
      var current = selectId || sel.value;
      sel.innerHTML = '<option value="">All Exams</option>';
      exams.forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.title + ' (' + e.submissionCount + ' submissions)';
        if (e.id === current) opt.selected = true;
        sel.appendChild(opt);
      });
      if (selectId) loadResults();
    });
}

function loadResults() {
  var examId = document.getElementById('resultsExamFilter').value;
  var url = '/api/results' + (examId ? '?examId=' + examId : '');

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(submissions) {
      var tbody = document.getElementById('resultsBody');
      tbody.innerHTML = '';

      if (submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No submissions yet.</td></tr>';
        document.getElementById('resultStats').style.display = 'none';
        return;
      }

      document.getElementById('resultStats').style.display = 'grid';
      document.getElementById('rTotal').textContent = submissions.length;
      var totalPct = submissions.reduce(function(s, r) { return s + r.percentage; }, 0);
      document.getElementById('rAvg').textContent = Math.round(totalPct / submissions.length) + '%';
      var passed = submissions.filter(function(r) { return r.percentage >= 60; }).length;
      document.getElementById('rPassed').textContent = passed;
      var autoSub = submissions.filter(function(r) { return r.autoSubmitted; }).length;
      document.getElementById('rAutoSub').textContent = autoSub;

      submissions.forEach(function(s, i) {
        // Build flag display for each submission
        var platformBadge = s.platform === 'app'
          ? '<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;padding:1px 6px;font-size:.7rem;font-weight:700;margin-left:4px">📱 App</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:5px;padding:1px 6px;font-size:.7rem;font-weight:700;margin-left:4px">🌐 Web</span>';
        var flagHtml = '';
        if (s.violation) {
          flagHtml = '<span class="flag-violation" title="Violation: Left exam page">⚠️ Violation</span>' + platformBadge;
        } else if (s.autoSubmitted) {
          flagHtml = '<span class="flag-auto" title="Auto-submitted (time out)">⚠ Auto</span>' + platformBadge;
        } else {
          flagHtml = '<span class="flag-normal">—</span>' + platformBadge;
        }

        var pctClass = s.percentage >= 75 ? '' : s.percentage >= 50 ? 'mid' : 'low';
        var subId = s.id || '';
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><strong>' + escHtml(s.lastName) + '</strong></td>' +
          '<td>' + escHtml(s.firstName) + '</td>' +
          '<td>' + escHtml(s.studentId) + '</td>' +
          '<td><span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:6px;font-size:.75rem;font-weight:700">' + escHtml(s.examTitle || '') + '</span></td>' +
          '<td>' + s.score + ' / ' + s.totalItems + '</td>' +
          '<td><div class="pct-wrap"><div class="pct-bar"><div class="pct-fill ' + pctClass + '" style="width:' + s.percentage + '%"></div></div><span class="pct-text">' + s.percentage + '%</span></div></td>' +
          '<td style="font-size:.78rem;color:#64748b">' + new Date(s.submittedAt).toLocaleString() + '</td>' +
          '<td>' + flagHtml + '</td>' +
          '<td style="display:flex;gap:6px;flex-wrap:nowrap">' +
            '<button class="btn-view" data-action="detail" data-idx="' + i + '">👁 View</button>' +
            '<button class="btn-del" data-action="delete-result" data-id="' + escHtml(subId) + '" data-name="' + escHtml(s.lastName + ', ' + s.firstName) + '" style="font-size:.75rem;padding:4px 8px">🗑 Del</button>' +
          '</td>';
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('button[data-action="detail"]').forEach(function(btn) {
        btn.addEventListener('click', function() { showDetail(parseInt(this.getAttribute('data-idx'))); });
      });

      tbody.querySelectorAll('button[data-action="delete-result"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id   = this.getAttribute('data-id');
          var name = this.getAttribute('data-name');
          deleteResult(id, name);
        });
      });

      window._submissions = submissions;
    });
}

function showDetail(idx) {
  var s = window._submissions[idx];
  if (!s) return;
  document.getElementById('modalTitle').textContent = s.lastName + ', ' + s.firstName + ' — ' + s.score + '/' + s.totalItems + ' (' + s.percentage + '%)';
  var body = document.getElementById('modalBody');
  body.innerHTML = '';
  s.answers.forEach(function(a, i) {
    var div = document.createElement('div');
    div.className = 'answer-item ' + (a.correct ? 'correct' : 'wrong');
    var typeLabel = a.type === 'mcq' ? 'MCQ' : a.type === 'truefalse' ? 'True/False' : 'ID';
    div.innerHTML = '<div class="answer-q">Q' + (i + 1) + '. <span style="font-size:.72rem;background:#e2e8f0;padding:1px 7px;border-radius:10px">' + typeLabel + '</span> ' + escHtml(a.question) + '</div><div class="answer-detail"><span>' + (a.correct ? '✅ Correct' : '❌ Wrong') + '</span><span>Student: <b>' + escHtml(a.studentAnswer || '(no answer)') + '</b></span>' + (a.correct ? '' : '<span>Correct: <b>' + escHtml(a.correctAnswer) + '</b></span>') + '</div>';
    body.appendChild(div);
  });
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }

function exportExcel() {
  var examId = document.getElementById('resultsExamFilter').value;
  window.location.href = '/api/export' + (examId ? '?examId=' + examId : '');
}

function deleteResult(id, name) {
  if (!id) { showToast('Cannot delete: this result has no ID (old record). Use Clear to remove it.', 'error'); return; }
  showConfirm('Delete Result', 'Delete result for "' + name + '"? This cannot be undone.', 'danger', function() {
    fetch('/api/results/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) { showToast(data.message, 'success'); loadResults(); }
        else showToast(data.error || 'Failed to delete.', 'error');
      })
      .catch(function() { showToast('Network error.', 'error'); });
  });
}

function clearResults() {
  var examId = document.getElementById('resultsExamFilter').value;
  var msg = examId ? 'Clear results for the selected exam?' : 'Clear ALL results for ALL exams?';
  showConfirm('Clear Results', msg, 'danger', function() {
    fetch('/api/results/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: examId || null }) })
      .then(function(r) { return r.json(); })
      .then(function(data) { if (data.success) { showToast(data.message, 'success'); loadResults(); } else showToast(data.error || 'Failed.', 'error'); })
      .catch(function() { showToast('Network error.', 'error'); });
  });
}

// ─────────────────────────────────────────
//  VIOLATIONS TAB
// ─────────────────────────────────────────
var _violationTypeDisplay = {
  'tab_switch':  '📵 Switched Tab/App',
  'window_blur': '🖥️ Left Exam Window',
  'screenshot':  '📸 Screenshot Attempt',
  'unknown':     '⚠️ Unknown Violation'
};

function loadViolations() {
  fetch('/api/violations/pending')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      // Update badge
      var badge = document.getElementById('violationBadge');
      if (badge) {
        if (list.length > 0) {
          badge.textContent = list.length;
          badge.style.display = 'inline-block';
          // Flash the violations tab button red if not active
          var tabBtn = document.getElementById('tab-violations');
          if (tabBtn && !tabBtn.classList.contains('active')) {
            tabBtn.style.background = 'rgba(220,38,38,.25)';
            tabBtn.style.color = '#fca5a5';
          }
        } else {
          badge.style.display = 'none';
          var tabBtn2 = document.getElementById('tab-violations');
          if (tabBtn2) { tabBtn2.style.background = ''; tabBtn2.style.color = ''; }
        }
      }

      var container = document.getElementById('violationsList');
      if (!container) return;

      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div>No active violations. All students are behaving.</div></div>';
        return;
      }

      container.innerHTML = '';
      list.forEach(function (v) {
        var card = document.createElement('div');
        card.className = 'violation-card';
        var typeLabel = _violationTypeDisplay[v.violationType] || '⚠️ Violation';
        var timeAgo = new Date(v.timestamp).toLocaleTimeString();
        card.innerHTML =
          '<div class="violation-info">' +
            '<div class="violation-student">' + escHtml(v.lastName) + ', ' + escHtml(v.firstName) + '</div>' +
            '<div class="violation-meta">' +
              '<span class="violation-type-badge">' + typeLabel + '</span>' +
              '<span>📋 ' + escHtml(v.examTitle) + '</span>' +
              '<span>🔢 Violation #' + v.violationCount + '</span>' +
              '<span>🕐 ' + timeAgo + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="violation-actions">' +
            '<button class="btn-allow" data-sid="' + escHtml(v.studentId) + '" data-eid="' + escHtml(v.examId) + '">✅ Allow Continue</button>' +
            '<button class="btn-force" data-sid="' + escHtml(v.studentId) + '" data-eid="' + escHtml(v.examId) + '" data-name="' + escHtml(v.lastName + ', ' + v.firstName) + '">🚫 Force Submit</button>' +
          '</div>';
        container.appendChild(card);
      });

      // Attach button listeners
      container.querySelectorAll('.btn-allow').forEach(function (btn) {
        btn.addEventListener('click', function () {
          resolveViolation(this.getAttribute('data-sid'), this.getAttribute('data-eid'), 'allow');
        });
      });
      container.querySelectorAll('.btn-force').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var name = this.getAttribute('data-name');
          resolveViolation(this.getAttribute('data-sid'), this.getAttribute('data-eid'), 'force_submit', name);
        });
      });
    })
    .catch(function () { /* silent fail */ });
}

function resolveViolation(studentId, examId, action, studentName) {
  if (action === 'force_submit' && studentName) {
    showConfirm('Force Submit', 'Force submit exam for ' + studentName + '? Their current answers will be saved with a violation flag.', 'danger', function () {
      _doResolve(studentId, examId, action);
    });
  } else {
    _doResolve(studentId, examId, action);
  }
}

function _doResolve(studentId, examId, action) {
  fetch('/api/violations/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: studentId, examId: examId, action: action })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        var msg = action === 'allow' ? 'Student allowed to continue.' : 'Exam force submitted.';
        showToast(msg, 'success');
        loadLiveMonitor();
      } else {
        showToast(data.error || 'Failed.', 'error');
      }
    })
    .catch(function () { showToast('Network error.', 'error'); });
}

// ─────────────────────────────────────────
//  AUTO REFRESH
// ─────────────────────────────────────────
// ─────────────────────────────────────────
//  LIVE MONITOR (combined live students + violations)
// ─────────────────────────────────────────
function loadLiveMonitor() {
  Promise.all([
    fetch('/api/students/live').then(function (r) { return r.json(); }),
    fetch('/api/violations/pending').then(function (r) { return r.json(); })
  ]).then(function (results) {
    var students   = results[0];
    var violations = results[1];

    // ── Update violation badge ──
    var badge  = document.getElementById('violationBadge');
    var tabBtn = document.getElementById('tab-violations');
    if (badge) {
      if (violations.length > 0) {
        badge.textContent = violations.length;
        badge.style.display = 'inline-block';
        if (tabBtn && !tabBtn.classList.contains('active')) {
          tabBtn.style.background = 'rgba(220,38,38,.25)';
          tabBtn.style.color = '#fca5a5';
        }
      } else {
        badge.style.display = 'none';
        if (tabBtn && !tabBtn.classList.contains('active')) {
          tabBtn.style.background = '';
          tabBtn.style.color = '';
        }
      }
    }

    // ── Update live count badge ──
    var liveCountBadge = document.getElementById('liveCountBadge');
    if (liveCountBadge) liveCountBadge.textContent = students.length + ' live';

    var container = document.getElementById('liveMonitorList');
    if (!container) return;

    // Build a map of violating students keyed by studentId_examId
    var violatingMap = {};
    violations.forEach(function (v) {
      violatingMap[v.studentId + '_' + v.examId] = v;
    });

    // Separate live students into violating and normal
    var violatingStudents = [];
    var normalStudents    = [];
    students.forEach(function (s) {
      var key = s.studentId + '_' + s.examId;
      if (violatingMap[key]) {
        violatingStudents.push(Object.assign({}, s, { _violation: violatingMap[key] }));
        delete violatingMap[key]; // mark as handled
      } else {
        normalStudents.push(s);
      }
    });

    // Add any violations whose student is no longer in live list (edge case)
    Object.values(violatingMap).forEach(function (v) {
      violatingStudents.push({
        studentId: v.studentId,
        firstName: v.firstName,
        lastName:  v.lastName,
        examId:    v.examId,
        examTitle: v.examTitle,
        platform:  v.platform || 'browser',
        joinedAt:  v.timestamp,
        _violation: v
      });
    });

    if (students.length === 0 && violations.length === 0) {
      container.innerHTML =
        '<div style="padding:32px;text-align:center;color:#94a3b8;font-size:.9rem">' +
        '<div style="font-size:2rem;margin-bottom:8px">👥</div>' +
        'No students are currently taking an exam.</div>';
      return;
    }

    var html = '';

    // ── VIOLATIONS SECTION (shown first) ──
    if (violatingStudents.length > 0) {
      html += '<div style="padding:8px 16px;background:#fef2f2;border-bottom:1px solid #fecaca;' +
        'font-size:.75rem;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.5px">' +
        '⚠️ Violations (' + violatingStudents.length + ')</div>';

      violatingStudents.forEach(function (s) {
        var v = s._violation;
        var typeLabel = _violationTypeDisplay[v.violationType] || '⚠️ Violation';
        var platformBadge = s.platform === 'app'
          ? '<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;padding:2px 7px;font-size:.7rem;font-weight:700">📱 App</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:2px 7px;font-size:.7rem;font-weight:700">🌐 Browser</span>';

        html +=
          '<div style="padding:12px 16px;border-bottom:1px solid #fee2e2;background:#fff5f5">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
              '<div>' +
                '<div style="font-weight:700;color:#dc2626;font-size:.95rem">⚠️ ' + escHtml(s.lastName) + ', ' + escHtml(s.firstName) + '</div>' +
                '<div style="font-size:.78rem;color:#94a3b8;margin-top:3px;display:flex;align-items:center;gap:8px">' +
                  platformBadge +
                  '<span>📋 ' + escHtml(s.examTitle || s.examId || '') + '</span>' +
                  '<span class="violation-type-badge">' + typeLabel + '</span>' +
                  '<span>Violation #' + v.violationCount + '</span>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;flex-shrink:0">' +
                '<button class="btn-allow" data-sid="' + escHtml(s.studentId) + '" data-eid="' + escHtml(s.examId) + '">✅ Allow</button>' +
                '<button class="btn-force" data-sid="' + escHtml(s.studentId) + '" data-eid="' + escHtml(s.examId) + '" data-name="' + escHtml(s.lastName + ', ' + s.firstName) + '">🚫 Force Submit</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      });
    }

    // ── NORMAL STUDENTS SECTION ──
    if (normalStudents.length > 0) {
      // Sort by joinedAt ascending (earliest first)
      normalStudents.sort(function (a, b) { return new Date(a.joinedAt) - new Date(b.joinedAt); });

      html += '<div style="padding:8px 16px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;' +
        'font-size:.75rem;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px">' +
        '🟢 Taking Exam (' + normalStudents.length + ')</div>';

      normalStudents.forEach(function (s) {
        var platformBadge = s.platform === 'app'
          ? '<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;padding:2px 7px;font-size:.7rem;font-weight:700">📱 App</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:2px 7px;font-size:.7rem;font-weight:700">🌐 Browser</span>';

        var joinedAgo = '';
        try {
          var diff = Math.floor((Date.now() - new Date(s.joinedAt)) / 1000);
          if (diff < 60) joinedAgo = diff + 's ago';
          else if (diff < 3600) joinedAgo = Math.floor(diff / 60) + 'm ago';
          else joinedAgo = Math.floor(diff / 3600) + 'h ago';
        } catch (e) { joinedAgo = ''; }

        html +=
          '<div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
            '<div>' +
              '<div style="font-weight:600;color:#1e293b;font-size:.9rem">' + escHtml(s.lastName + ', ' + s.firstName) + '</div>' +
              '<div style="font-size:.78rem;color:#64748b;margin-top:2px">📋 ' + escHtml(s.examTitle || s.examId || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              platformBadge +
              '<span style="font-size:.78rem;color:#94a3b8">' + joinedAgo + '</span>' +
            '</div>' +
          '</div>';
      });
    }

    container.innerHTML = html;

    // Attach violation button listeners
    container.querySelectorAll('.btn-allow').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveViolation(this.getAttribute('data-sid'), this.getAttribute('data-eid'), 'allow');
      });
    });
    container.querySelectorAll('.btn-force').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveViolation(this.getAttribute('data-sid'), this.getAttribute('data-eid'), 'force_submit', this.getAttribute('data-name'));
      });
    });

  }).catch(function () { /* silent fail */ });
}

function startAutoRefresh() {
  autoRefreshTimer = setInterval(function() {
    var activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && activePanel.id === 'panel-exams') loadExamsList();
    if (activePanel && activePanel.id === 'panel-violations') loadLiveMonitor();
    if (activePanel && activePanel.id === 'panel-attendance') loadAttendanceSessions();
    // Always poll violations badge (even when on other tabs)
    loadViolationsBadge();
  }, 4000);
}

function loadViolationsBadge() {
  fetch('/api/violations/pending')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      var badge = document.getElementById('violationBadge');
      var tabBtn = document.getElementById('tab-violations');
      if (!badge || !tabBtn) return;
      if (list.length > 0) {
        badge.textContent = list.length;
        badge.style.display = 'inline-block';
        if (!tabBtn.classList.contains('active')) {
          tabBtn.style.background = 'rgba(220,38,38,.25)';
          tabBtn.style.color = '#fca5a5';
        }
      } else {
        badge.style.display = 'none';
        if (!tabBtn.classList.contains('active')) {
          tabBtn.style.background = '';
          tabBtn.style.color = '';
        }
      }
    })
    .catch(function () { });
}

// ─────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(function() { t.className = ''; }, 3500);
}

function showConfirm(title, message, type, callback) {
  _confirmCallback = callback;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  var okBtn = document.getElementById('confirmOkBtn');
  okBtn.className = 'btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary');
  okBtn.textContent = type === 'danger' ? 'Yes, Delete' : 'Confirm';
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
  _confirmCallback = null;
}

// ─────────────────────────────────────────
//  ATTENDANCE FUNCTIONS
// ─────────────────────────────────────────
var _currentAttSessionId = null;

function openCreateAttendanceModal() {
  var modal = document.getElementById('createAttendanceModal');
  var titleInput = document.getElementById('attSessionTitle');
  if (titleInput) titleInput.value = '';
  if (modal) modal.style.display = 'flex';
  setTimeout(function() { if (titleInput) titleInput.focus(); }, 100);
}

function closeCreateAttendanceModal() {
  var modal = document.getElementById('createAttendanceModal');
  if (modal) modal.style.display = 'none';
}

function createAttendanceSession() {
  var title = document.getElementById('attSessionTitle').value.trim();
  if (!title) { showToast('Please enter a session title.', 'error'); return; }

  fetch('/api/attendance/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        showToast('✅ Session created! Code: ' + data.session.code, 'success');
        closeCreateAttendanceModal();
        loadAttendanceSessions();
      } else {
        showToast(data.error || 'Failed to create session.', 'error');
      }
    })
    .catch(function() { showToast('Network error.', 'error'); });
}

function loadAttendanceSessions() {
  fetch('/api/attendance')
    .then(function(r) { return r.json(); })
    .then(function(sessions) {
      var container = document.getElementById('attendanceSessionsList');
      if (!container) return;

      if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div>No attendance sessions yet. Click <strong>New Session</strong> to create one.</div></div>';
        return;
      }

      container.innerHTML = '';
      // Sort newest first
      sessions.slice().reverse().forEach(function(s) {
        var card = document.createElement('div');
        card.className = 'exam-card ' + (s.active ? 'is-active' : 'is-inactive');

        var created = new Date(s.createdAt).toLocaleDateString();
        var statusBadge = s.active
          ? '<span class="badge-active"><span class="badge-dot"></span>Active</span>'
          : '<span class="badge-inactive"><span class="badge-dot"></span>Inactive</span>';
        var toggleText = s.active ? '⏸ Deactivate' : '▶️ Activate';
        var toggleClass = s.active ? 'btn-deactivate' : 'btn-activate';

        card.innerHTML =
          '<div class="exam-card-info">' +
            '<div class="exam-code-badge">🔑 Code: <strong style="letter-spacing:2px;font-size:1rem">' + escHtml(s.code) + '</strong> ' + statusBadge + '</div>' +
            '<div class="exam-card-title">' + escHtml(s.title) + '</div>' +
            '<div class="exam-card-meta">' +
              '<span>🕐 Timed In: <strong>' + s.totalIn + '</strong></span>' +
              '<span>🚪 Timed Out: <strong>' + s.totalOut + '</strong></span>' +
              '<span>📅 ' + created + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="exam-card-actions">' +
            '<button class="btn-view" data-action="view" data-id="' + s.id + '">👁 Records</button>' +
            '<button class="' + toggleClass + '" data-action="toggle" data-id="' + s.id + '">' + toggleText + '</button>' +
            '<button class="btn-del" data-action="delete" data-id="' + s.id + '" data-title="' + escHtml(s.title) + '">🗑 Delete</button>' +
          '</div>';

        container.appendChild(card);
      });

      // Attach listeners
      container.querySelectorAll('button[data-action]').forEach(function(btn) {
        btn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          var action = this.getAttribute('data-action');
          var id = this.getAttribute('data-id');
          var title = this.getAttribute('data-title');
          if (action === 'view') viewAttendanceRecords(id);
          else if (action === 'toggle') toggleAttendanceSession(id);
          else if (action === 'delete') deleteAttendanceSession(id, title);
        };
      });
    })
    .catch(function() { showToast('Failed to load attendance sessions.', 'error'); });
}

function toggleAttendanceSession(id) {
  fetch('/api/attendance/' + id + '/toggle', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) { showToast(data.message, 'success'); loadAttendanceSessions(); }
      else showToast(data.error || 'Failed.', 'error');
    })
    .catch(function() { showToast('Network error.', 'error'); });
}

function deleteAttendanceSession(id, title) {
  showConfirm('Delete Session', 'Delete "' + title + '"? All attendance records will be lost.', 'danger', function() {
    fetch('/api/attendance/' + id, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) { showToast(data.message, 'success'); loadAttendanceSessions(); }
        else showToast(data.error || 'Failed.', 'error');
      })
      .catch(function() { showToast('Network error.', 'error'); });
  });
}

function viewAttendanceRecords(id) {
  _currentAttSessionId = id;
  fetch('/api/attendance/' + id)
    .then(function(r) { return r.json(); })
    .then(function(session) {
      document.getElementById('attRecordsTitle').textContent = '📋 ' + session.title + ' — ' + session.code;
      var body = document.getElementById('attRecordsBody');
      var countEl = document.getElementById('attRecordsCount');

      if (!session.records || session.records.length === 0) {
        body.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-icon">🕐</div><div>No students have checked in yet.</div></div>';
        if (countEl) countEl.textContent = '0 records';
        document.getElementById('attendanceRecordsModal').style.display = 'flex';
        return;
      }

      if (countEl) countEl.textContent = session.records.length + ' record' + (session.records.length !== 1 ? 's' : '');

      var html = '<table style="width:100%;border-collapse:collapse;font-size:.85rem">' +
        '<thead><tr style="background:#f1f5f9">' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">#</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Name</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Platform</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Time In</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Time Out</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Duration</th>' +
        '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#334155">Learning Summary</th>' +
        '<th style="padding:8px 12px;text-align:center;font-weight:700;color:#334155">Del</th>' +
        '</tr></thead><tbody>';

      session.records.forEach(function(r, i) {
        var platformBadge = r.platform === 'app'
          ? '<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;padding:2px 7px;font-size:.72rem;font-weight:700">📱 App</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:5px;padding:2px 7px;font-size:.72rem;font-weight:700">🌐 Browser</span>';
        var timeIn  = r.timeIn  ? new Date(r.timeIn).toLocaleTimeString()  : '—';
        var timeOut = r.timeOut ? new Date(r.timeOut).toLocaleTimeString() : '<span style="color:#f59e0b;font-weight:600">In progress</span>';
        var duration = r.duration || (r.timeOut ? '—' : '<span style="color:#f59e0b">—</span>');
        var summary = r.learningSummary
          ? '<span style="color:#1e293b">' + escHtml(r.learningSummary) + '</span>'
          : '<span style="color:#94a3b8;font-style:italic">(not yet)</span>';
        var rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';

        html += '<tr style="background:' + rowBg + ';border-bottom:1px solid #f1f5f9">' +
          '<td style="padding:8px 12px;color:#94a3b8">' + (i + 1) + '</td>' +
          '<td style="padding:8px 12px;font-weight:600;color:#1e293b">' + escHtml(r.lastName + ', ' + r.firstName) + '</td>' +
          '<td style="padding:8px 12px">' + platformBadge + '</td>' +
          '<td style="padding:8px 12px;color:#334155">' + timeIn + '</td>' +
          '<td style="padding:8px 12px;color:#334155">' + timeOut + '</td>' +
          '<td style="padding:8px 12px;color:#334155">' + duration + '</td>' +
          '<td style="padding:8px 12px;max-width:280px;word-wrap:break-word;line-height:1.5">' + summary + '</td>' +
          '<td style="padding:8px 12px;text-align:center">' +
            '<button class="btn-del-att-record" data-sid="' + escHtml(id) + '" data-rid="' + escHtml(r.id) + '" data-name="' + escHtml(r.lastName + ', ' + r.firstName) + '" style="padding:4px 8px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer">🗑</button>' +
          '</td>' +
          '</tr>';
      });

      html += '</tbody></table>';
      body.innerHTML = html;

      // Attach delete record listeners
      body.querySelectorAll('.btn-del-att-record').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sid  = this.getAttribute('data-sid');
          var rid  = this.getAttribute('data-rid');
          var name = this.getAttribute('data-name');
          deleteAttendanceRecord(sid, rid, name);
        });
      });

      document.getElementById('attendanceRecordsModal').style.display = 'flex';
    })
    .catch(function() { showToast('Failed to load records.', 'error'); });
}

function deleteAttendanceRecord(sessionId, recordId, name) {
  showConfirm('Delete Record', 'Delete attendance record for "' + name + '"? This cannot be undone.', 'danger', function() {
    fetch('/api/attendance/' + sessionId + '/records/' + recordId, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          showToast(data.message, 'success');
          viewAttendanceRecords(sessionId); // refresh the modal
        } else {
          showToast(data.error || 'Failed to delete.', 'error');
        }
      })
      .catch(function() { showToast('Network error.', 'error'); });
  });
}

function closeAttendanceRecordsModal() {
  document.getElementById('attendanceRecordsModal').style.display = 'none';
  _currentAttSessionId = null;
}

function exportAttendanceExcel() {
  if (!_currentAttSessionId) return;
  window.location.href = '/api/attendance/export/' + _currentAttSessionId;
}

window.switchTab = switchTab;
window.newExam = newExam;
window.saveExam = saveExam;
window.addQuestion = addQuestion;
window.clearAllQuestions = clearAllQuestions;
window.exportExcel = exportExcel;
window.clearResults = clearResults;
window.closeModal = closeModal;
window.closeConfirmModal = closeConfirmModal;
window.loadLiveMonitor = loadLiveMonitor;
window.loadAttendanceSessions = loadAttendanceSessions;
window.openCreateAttendanceModal = openCreateAttendanceModal;
window.closeCreateAttendanceModal = closeCreateAttendanceModal;
window.createAttendanceSession = createAttendanceSession;
window.viewAttendanceRecords = viewAttendanceRecords;
window.closeAttendanceRecordsModal = closeAttendanceRecordsModal;
window.exportAttendanceExcel = exportAttendanceExcel;
window.toggleAttendanceSession = toggleAttendanceSession;
window.deleteAttendanceSession = deleteAttendanceSession;
window.deleteAttendanceRecord = deleteAttendanceRecord;
window.loadViolations = loadViolations;
window.toggleQuestionMode = toggleQuestionMode;
window.openJsonImportModal = openJsonImportModal;
window.closeJsonImportModal = closeJsonImportModal;
window.handleJsonFileUpload = handleJsonFileUpload;
window.previewJsonImport = previewJsonImport;
window.confirmJsonImport = confirmJsonImport;

// ─────────────────────────────────────────
//  JSON IMPORT
// ─────────────────────────────────────────

// Parsed questions ready to import (set by previewJsonImport)
var _pendingImportQuestions = [];

function openJsonImportModal() {
  // Reset state
  _pendingImportQuestions = [];
  var modal = document.getElementById('jsonImportModal');
  var textarea = document.getElementById('jsonImportText');
  var fileInput = document.getElementById('jsonFileInput');
  var preview = document.getElementById('jsonImportPreview');
  var errEl = document.getElementById('jsonImportError');
  var btn = document.getElementById('jsonImportBtn');
  if (textarea) textarea.value = '';
  if (fileInput) fileInput.value = '';
  if (preview) preview.style.display = 'none';
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed'; }
  if (modal) { modal.style.display = 'flex'; }
}

function closeJsonImportModal() {
  var modal = document.getElementById('jsonImportModal');
  if (modal) modal.style.display = 'none';
  _pendingImportQuestions = [];
}

function handleJsonFileUpload(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var textarea = document.getElementById('jsonImportText');
    if (textarea) {
      textarea.value = e.target.result;
      previewJsonImport();
    }
  };
  reader.onerror = function () {
    showJsonImportError('Could not read the file. Please try again.');
  };
  reader.readAsText(file);
}

function previewJsonImport() {
  var textarea = document.getElementById('jsonImportText');
  var raw = textarea ? textarea.value.trim() : '';
  var preview = document.getElementById('jsonImportPreview');
  var errEl = document.getElementById('jsonImportError');
  var btn = document.getElementById('jsonImportBtn');
  var previewTitle = document.getElementById('jsonPreviewTitle');
  var previewDetails = document.getElementById('jsonPreviewDetails');

  // Hide both panels first
  if (preview) preview.style.display = 'none';
  if (errEl) errEl.style.display = 'none';
  _pendingImportQuestions = [];
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed'; }

  if (!raw) return;

  // Parse JSON
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    showJsonImportError('❌ Invalid JSON: ' + e.message);
    return;
  }

  // Support both array format and { questions: [...] } format
  var qList = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.questions) ? parsed.questions : null);
  if (!qList) {
    showJsonImportError('❌ JSON must be an array of questions, or an object with a "questions" array.');
    return;
  }
  if (qList.length === 0) {
    showJsonImportError('❌ The questions array is empty.');
    return;
  }

  // Validate each question
  var valid = [];
  var skipped = 0;
  var mcqCount = 0, tfCount = 0, idCount = 0;

  qList.forEach(function (q, i) {
    var num = i + 1;
    if (!q || typeof q !== 'object') { skipped++; return; }
    var type = (q.type || '').toLowerCase().trim();
    if (!['mcq', 'truefalse', 'identification'].includes(type)) { skipped++; return; }
    if (!q.question || String(q.question).trim() === '') { skipped++; return; }
    if (!q.answer || String(q.answer).trim() === '') { skipped++; return; }
    if (type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) { skipped++; return; }
      mcqCount++;
    } else if (type === 'truefalse') {
      tfCount++;
    } else {
      idCount++;
    }
    valid.push(q);
  });

  if (valid.length === 0) {
    showJsonImportError('❌ No valid questions found. Check the format guide below.');
    return;
  }

  _pendingImportQuestions = valid;

  // Show preview
  var details = '';
  if (mcqCount > 0) details += '📝 Multiple Choice: <strong>' + mcqCount + '</strong><br>';
  if (tfCount > 0)  details += '✅ True / False: <strong>' + tfCount + '</strong><br>';
  if (idCount > 0)  details += '🔤 Identification: <strong>' + idCount + '</strong><br>';
  if (skipped > 0)  details += '<span style="color:#d97706">⚠️ Skipped (invalid): ' + skipped + '</span><br>';

  if (previewTitle) previewTitle.textContent = '✅ ' + valid.length + ' question' + (valid.length !== 1 ? 's' : '') + ' ready to import';
  if (previewDetails) previewDetails.innerHTML = details;
  if (preview) preview.style.display = 'block';

  // Enable import button
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
}

function showJsonImportError(msg) {
  var errEl = document.getElementById('jsonImportError');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
}

function confirmJsonImport() {
  if (!_pendingImportQuestions || _pendingImportQuestions.length === 0) return;

  var imported = 0;
  _pendingImportQuestions.forEach(function (q) {
    var type = (q.type || '').toLowerCase().trim();

    // Normalize MCQ answer to A/B/C/D
    var answer = String(q.answer).trim();
    if (type === 'mcq') {
      var upper = answer.toUpperCase();
      if (['A','B','C','D'].includes(upper)) {
        answer = upper;
      } else {
        // Try numeric (0→A, 1→B, 2→C, 3→D)
        var num = parseInt(answer);
        answer = (!isNaN(num) && num >= 0 && num <= 3) ? ['A','B','C','D'][num] : 'A';
      }
    }

    // Normalize True/False answer
    if (type === 'truefalse') {
      answer = answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase();
      if (answer !== 'True' && answer !== 'False') answer = 'True';
    }

    // Normalize options for MCQ (pad to 4 if needed)
    var options = null;
    if (type === 'mcq') {
      var rawOpts = Array.isArray(q.options) ? q.options : [];
      options = [
        String(rawOpts[0] || '').trim(),
        String(rawOpts[1] || '').trim(),
        String(rawOpts[2] || '').trim(),
        String(rawOpts[3] || '').trim()
      ];
    }

    // For identification: support answer as string, array, or answers[] array
    if (type === 'identification') {
      if (Array.isArray(q.answers) && q.answers.length > 0) {
        // JSON format: { answers: ["ans1", "ans2"] }
        answer = q.answers.map(function(a) { return String(a).trim(); }).filter(function(a) { return a !== ''; });
        if (answer.length === 0) answer = [''];
      } else if (Array.isArray(q.answer)) {
        answer = q.answer.map(function(a) { return String(a).trim(); }).filter(function(a) { return a !== ''; });
        if (answer.length === 0) answer = [''];
      } else {
        answer = [String(q.answer).trim()];
      }
    }

    // Push directly into the questions[] array (same structure as addQuestion)
    questions.push({
      type:     type,
      question: String(q.question).trim(),
      answer:   answer,
      options:  options
    });
    imported++;
  });

  // Re-render all questions at once (much faster than calling addQuestion() per item)
  renderQuestions();
  closeJsonImportModal();
  showToast('✅ Imported ' + imported + ' question' + (imported !== 1 ? 's' : '') + ' successfully!', 'success');
}
