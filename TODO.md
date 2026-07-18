# Violation Policy & Student Proctoring TODO

- [x] Add exam-level violation policy fields in backend (`server.js`)
- [x] Add teacher UI controls for selecting violation policy (`public/teacher/index.html`)
- [x] Wire teacher builder logic to save/load violation policy (`public/teacher/teacher.js`)
- [x] Update violation report/check APIs to enforce selected policy (`server.js`)
- [x] Update submit grading to deduct score based on violations when policy requires (`server.js`)
- [x] Update student runtime to follow server policy (remove hardcoded auto-submit at 2) (`public/student/student.js`)
- [x] Enforce auto fullscreen behavior on exam start and while exam is active (`public/student/student.js`)
- [x] Ensure clear popup is shown whenever violation is detected (`public/student/student.js` / `public/student/index.html` if needed)
- [ ] Implement policy-specific popup button behavior (deduct/auto3/teacher_decides) (`public/student/student.js`, `public/student/index.html`)
- [ ] Verify live monitor visibility remains while students are in violation state (`server.js` + runtime check)
- [ ] Thorough testing (API + UI flow)
- [ ] Final validation and completion
