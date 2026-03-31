const http = require('http');

console.log('Testing API endpoints...\n');

// Test 1: GET /api/exams
http.get('http://localhost:3000/api/exams', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('GET /api/exams:');
    console.log('Status:', res.statusCode);
    console.log('Response:', data.substring(0, 200));
    console.log('');
  });
});

// Test 2: GET /teacher/teacher.js
http.get('http://localhost:3000/teacher/teacher.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('GET /teacher/teacher.js:');
    console.log('Status:', res.statusCode);
    console.log('First 200 chars:', data.substring(0, 200));
    console.log('');
  });
});
