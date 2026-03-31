# 📋 Offline Exam System — Setup Guide for Co-Teachers

## ✅ Step 1: Install Node.js (One-time setup)

1. Go to: **https://nodejs.org**
2. Download the **LTS version** (the green button)
3. Run the installer — click **Next** all the way through
4. Restart your computer after installation

---

## ✅ Step 2: Get the Project Files

Your co-teacher should send you the project as a **ZIP file**.

> **How to ZIP the project (for the person sharing):**
> 1. Open File Explorer
> 2. Find the `offline-exam-system` folder
> 3. Right-click it → **Send to** → **Compressed (zipped) folder**
> 4. Share the ZIP file via USB drive, Google Drive, email, etc.
>
> ⚠️ **Do NOT include the `node_modules` folder** — it's very large and not needed.
> To exclude it: delete `node_modules` first, then ZIP, then re-run `start.bat` to reinstall.

---

## ✅ Step 3: Extract and Run

1. **Extract** the ZIP file to your Desktop (or anywhere you like)
2. Open the extracted folder `offline-exam-system`
3. Double-click **`start.bat`**
4. Wait for the server to start — you'll see something like:

```
  📋 Teacher Dashboard : http://192.168.1.5:3000/teacher
  📱 Student Access    : http://192.168.1.5:3000
  🔐 Teacher Password  : teacher123
```

5. Open your browser and go to the **Teacher Dashboard** link shown

---

## ✅ Step 4: Share with Students

- Make sure your computer and students' devices are on the **same WiFi network**
- Share the **Student Access** link (e.g., `http://192.168.1.5:3000`) with students
- Students open that link in any browser (phone, tablet, or PC)

---

## 🔐 Default Teacher Password

```
teacher123
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| `start.bat` shows "Node.js is not installed" | Install Node.js from https://nodejs.org |
| Browser shows "This site can't be reached" | Make sure `start.bat` is still running (don't close the black window) |
| Students can't connect | Make sure everyone is on the same WiFi network |
| Port already in use | Restart your computer and try again |

---

## 📁 Important Files

| File/Folder | Purpose |
|---|---|
| `start.bat` | **Double-click this to start the system** (Windows) |
| `server.js` | Main server file (for cloud/Linux) |
| `data/exams.json` | Stores all your exams |
| `data/submissions.json` | Stores all student submissions |
| `data/attendance.json` | Stores attendance records |
| `data/config.json` | Teacher password and configuration |
| `public/` | The web pages (student & teacher portals) |
| `DEPLOY.md` | **Cloud deployment guide** |

---

*Keep the black terminal window open while the exam is running. Closing it will stop the server.*

---

## ☁️ Want to Deploy to the Cloud?

The exam system can be deployed to cloud platforms (Railway, Render, DigitalOcean, AWS, etc.) so students can access it from anywhere on the internet.

**See [DEPLOY.md](DEPLOY.md) for complete cloud deployment instructions.**

### Quick Deploy (Railway)

1. Push your code to GitHub
2. Sign up at [railway.app](https://railway.app)
3. Create a new project from your GitHub repo
4. Set environment variables:
   ```
   PORT=3000
   HOST=0.0.0.0
   ```
5. Add a persistent volume mounted at `/data`
6. Deploy! You'll get a public URL like `https://your-app.up.railway.app`

The system works identically online and offline — all features (exam taking, grading, attendance, violation detection, Excel export) are fully supported in the cloud.

---

### What Changes in Cloud Mode?

- **No local IP address:** Shows your public URL instead of `192.168.1.x`
- **Persistent storage:** Data saved to a disk volume (not ephemeral)
- **Accessible from anywhere:** Students don't need to be on the same WiFi
- **HTTPS enabled:** Most platforms provide automatic SSL certificates

ℹ️ **The exam system itself works exactly the same** — teachers create exams, students take them, results are graded automatically. All features are preserved.

---

### Which Cloud Platform?

- **Railway** (Recommended): Free tier, easy setup, persistent volumes
- **Render**: Free tier, persistent disk, very simple
- **DigitalOcean**: $5/mo, more control
- **AWS EC2**: 12-month free tier, more configuration needed

See [DEPLOY.md](DEPLOY.md) for detailed step-by-step guides for each platform.

---

## ❓ Need Help?

- **Local/LAN issues:** Read this guide's Troubleshooting section
- **Cloud deployment issues:** See [DEPLOY.md - Troubleshooting](DEPLOY.md#troubleshooting)
- **Report bugs:** Open an issue on GitHub
