# 📋 Offline Exam System

A lightweight, self-hosted exam management system that works on local networks **and** in the cloud. Students take exams via web browser; teachers create, manage, and grade exams through a dashboard. No internet required for basic use — deploy anywhere.

[Deploy to Cloud](DEPLOY.md) | [Local Setup Guide](SETUP-GUIDE.md)

---

## ✨ Features

### For Teachers
- 📝 **Create exams** with Multiple Choice, True/False, and Identification questions
- ⏱ **Set time limits** (per exam or per question in "one-by-one" mode)
- 👥 **Live monitoring** with violation detection (tab switching, page blur)
- 📊 **Auto-grading** and Excel export (summary + detailed answers)
- 📋 **Attendance tracking** with time-in/time-out and learning summaries
- 🔐 **Password protection** (changeable)
- 🎯 **Question shuffle** — each student gets a different order
- 📱 **Mobile-friendly** responsive design

### For Students
- 🌐 **Works on any device** — phone, tablet, or computer
- 📵 **Tab-switch detection** — exams pause if you leave the page
- ⏳ **Auto-submit on exit** — answers saved if you accidentally close the tab
- 📊 **One-by-one mode** — timed questions with no skipping
- ✅ **Instant confirmation** — see your exam is submitted

---

## 🚀 Quick Start (Local Network)

### Windows

1. Install [Node.js LTS](https://nodejs.org) (version 18 or higher)
2. Extract the project to a folder
3. Double-click **`start.bat`**
4. Wait for the server to start
5. Share the **Student Access** URL with your class

> **Note:** Keep the black terminal window open while the exam is running.

See [SETUP-GUIDE.md](SETUP-GUIDE.md) for detailed instructions.

---

## ☁️ Deploy to Cloud

The system can be deployed to cloud platforms for internet-wide access:

| Platform | Free Tier | Persistent Storage | URL |
|----------|-----------|-------------------|-----|
| **Railway** | ✅ | ✅ Volumes | [Deploy →](DEPLOY.md#railway) |
| **Render** | ✅ | ✅ Disk | [Deploy →](DEPLOY.md#render) |
| **DigitalOcean** | Limited | ✅ Volumes | [Deploy →](DEPLOY.md#digitalocean) |
| **AWS EC2** | 12mo free | ⚠️ EBS | [Deploy →](DEPLOY.md#aws-ec2) |
| **VPS** | ~$5/mo | ✅ Full disk | [Deploy →](DEPLOY.md#vps-generic) |

All features work identically in the cloud:
- ✅ Exam creation and management
- ✅ Student exam taking with anti-cheat
- ✅ Real-time monitoring
- ✅ Attendance tracking
- ✅ Excel export
- ✅ Data persistence

See [DEPLOY.md](DEPLOY.md) for complete deployment guides.

---

## 🏗 Architecture

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (no build step)
- **Storage:** JSON files (`data/` directory)
- **Deployment:** Any Node.js hosting (VPS, PaaS, containers)
- **Size:** ~10MB (excluding node_modules)

---

## 📁 Project Structure

```
offline-exam-system/
├── server.js           # Main server (start this)
├── start.bat           # Windows launcher
├── package.json        # Dependencies
├── data/               # Created at runtime
│   ├── exams.json      # Exam definitions
│   ├── submissions.json # Student results
│   ├── attendance.json # Attendance records
│   └── config.json     # Teacher password & config
├── public/
│   ├── teacher/        # Teacher dashboard
│   │   ├── index.html
│   │   ├── teacher.js
│   │   └── teacher.css
│   └── student/        # Student portal
│       ├── index.html
│       └── student.js
├── node_modules/       # Installed dependencies
├── dist/               # Built executables (optional)
├── SETUP-GUIDE.md      # Local/LAN setup
├── DEPLOY.md          # Cloud deployment
└── README.md          # This file
```

---

## 🔐 Default Credentials

- **Teacher Password:** `teacher123` (changeable in Dashboard → Settings)

**Important:** Change the teacher password immediately after first login, especially if deploying to the cloud.

---

## 🎯 How It Works

1. **Teacher** starts the server and logs into `/teacher`
2. **Teacher** creates exams, sets time limits, activates them
3. **Students** open the student portal on their devices
4. **Students** enter their name and exam code to begin
5. **System** monitors for violations (tab switching, leaving page)
6. **Students** submit exams before time runs out
7. **Teacher** views results, exports to Excel, tracks attendance

All communication happens over the local network (LAN) or internet (cloud). No external API calls — 100% offline-capable when run locally.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address (use `0.0.0.0` for cloud) |
| `PUBLIC_URL` | (auto) | Public URL override for cloud deployments |
| `DEPLOYMENT_MODE` | `auto` | Force mode: `local` or `cloud` |

### Config File (`data/config.json`)

```json
{
  "teacherPassword": "teacher123",
  "deploymentMode": "auto",
  "publicUrl": "",
  "serverName": ""
}
```

---

## 🔒 Security Notes

- **Cloud deployments:**
  - Change the default teacher password immediately
  - Use HTTPS (automatically provided by most platforms)
  - Consider IP whitelisting if only specific networks should access

- **Local deployments:**
  - Only accessible on your local network
  - No internet exposure unless you configure port forwarding

- **Data storage:**
  - All data stored in `data/` directory on the server
  - Ensure proper file permissions if deploying to a shared server
  - Back up `data/` folder regularly

---

## 📦 Installation & Dependencies

```bash
# Install dependencies
npm install

# Start server (development)
node server.js

# Or on Windows, double-click:
# start.bat
```

**Dependencies:**
- `express` — Web server
- `xlsx` — Excel export
- `helmet` — Security headers

---

## 🧪 Testing

### Create test exam via API:

```bash
curl -X POST http://localhost:3000/api/exam/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TEST-001",
    "timeLimit": 15,
    "maxStudents": 5,
    "questions": [
      {
        "type": "mcq",
        "question": "What is 2+2?",
        "options": ["3", "4", "5", "6"],
        "answer": "B"
      }
    ]
  }'
```

### Activate exam:

```bash
curl -X POST http://localhost:3000/api/exams/TEST-001/toggle
```

(Replace `TEST-001` with your exam ID)

---

## 📸 Screenshots

| Teacher Dashboard | Student Portal | Exam Taking |
|-------------------|----------------|-------------|
| ![Teacher](docs/teacher-dashboard.png) | ![Student](docs/student-portal.png) | ![Exam](docs/exam-screen.png) |

*(Screenshots coming soon)*

---

## 🛠 Development

### Run with auto-reload (using nodemon):

```bash
npm install -g nodemon
nodemon server.js
```

### Build standalone .exe (Windows):

```bash
npm run build
```

This creates `dist/offline-exam-system.exe` — a standalone Windows executable that doesn't require Node.js installed.

---

## 📝 License

MIT License. Feel free to use and modify for educational purposes.

---

## 🙏 Credits

Developed for educational institutions needing a simple, offline-capable exam system. Works in low-connectivity areas and respects student privacy — no data leaves your server.

---

## 🔗 Links

- **Local Setup:** [SETUP-GUIDE.md](SETUP-GUIDE.md)
- **Cloud Deployment:** [DEPLOY.md](DEPLOY.md)
- **Issues:** [GitHub Issues](https://github.com/your-username/offline-exam-system/issues)
- **Repository:** [github.com/your-username/offline-exam-system](https://github.com/your-username/offline-exam-system)

---

**Made with ❤️ for teachers and students everywhere.**
