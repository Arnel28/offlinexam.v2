# Deployment Guide — Offline Exam System

This guide covers how to deploy the Offline Exam System to cloud platforms so it's accessible from anywhere on the internet.

## 📋 Table of Contents

- [Quick Overview](#quick-overview)
- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
  - [Railway (Recommended)](#railway)
  - [Render](#render)
  - [DigitalOcean App Platform](#digitalocean)
  - [AWS EC2](#aws-ec2)
  - [VPS (Generic)](#vps-generic)
- [Configuration](#configuration)
- [Custom Domain](#custom-domain)
- [SSL HTTPS](#ssl-https)
- [Troubleshooting](#troubleshooting)

---

## Quick Overview

The system is a Node.js + Express application that uses JSON files for data storage. It can be deployed to any platform that supports Node.js.

**What you need:**
- A cloud hosting account (free tiers available)
- Git installed on your computer
- The exam system code in a GitHub repository

**What this guide will help you do:**
1. Push your code to GitHub
2. Connect your GitHub repo to a cloud platform
3. Configure environment variables
4. Deploy and get a public URL
5. (Optional) Set up a custom domain with HTTPS

---

## Prerequisites

### 1. Push to GitHub

Before deploying, make sure your code is in a GitHub repository:

```bash
# Inside your offline-exam-system folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/offline-exam-system.git
git push -u origin main
```

**Important:** Add a `.gitignore` file to exclude unnecessary files:

```gitignore
node_modules/
dist/
data/*.json
!.gitignore
!data/config.json
```

Only `data/config.json` should be committed (it contains teacher password). Other JSON files are created at runtime.

### 2. Install Dependencies Locally

```bash
npm install
```

---

## Deployment Options

### Railway 🚂

Railway offers a generous free tier and easy GitHub integration.

**Steps:**

1. **Sign up** at [railway.app](https://railway.app) (use GitHub login)

2. **Create a new project:**
   - Click **New Project**
   - Select **Deploy from GitHub repo**
   - Choose your `offline-exam-system` repository

3. **Configure:**
   - Railway auto-detects Node.js
   - Build command: `npm install` (default)
   - Start command: `node server.js`

4. **Set Environment Variables** (in Railway dashboard → Variables):
   ```
   PORT=3000
   HOST=0.0.0.0
   NODE_ENV=production
   ```
   - Leave `PUBLIC_URL` blank (Railway provides the URL automatically)

5. **Persistent Storage** (IMPORTANT):
   - JSON files are stored in the `data/` folder
   - Railway's filesystem is ephemeral (resets on deploy)
   - **Add a Volume:**
     - Go to your project → **Volumes** tab
     - Click **Add Volume**
     - Mount path: `/data`
     - Size: 1GB (free)
   - This ensures exams, submissions, and attendance data persist across restarts

6. **Deploy:**
   - Railway automatically deploys on git push
   - After deployment, you'll get a URL like: `https://your-project.up.railway.app`

7. **Access your system:**
   - Teacher Dashboard: `https://your-url.up.railway.app/teacher`
   - Student Portal: `https://your-url.up.railway.app`

---

### Render 🎨

Render also offers free tier with persistent disks.

**Steps:**

1. **Sign up** at [render.com](https://render.com)

2. **Create a Web Service:**
   - Click **Create → Web Service**
   - Connect your GitHub repository
   - Name: `offline-exam-system`

3. **Configure:**
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Plan: **Free**

4. **Environment Variables:**
   ```
   PORT=10000
   HOST=0.0.0.0
   NODE_ENV=production
   ```

5. **Persistent Disk** (IMPORTANT):
   - Render provides a persistent disk automatically for free tier
   - Mount path: `/data`
   - Size: 1GB
   - This is where JSON data files are stored

6. **Create Web Service**
   - Render will build and deploy
   - You'll get a URL like: `https://offline-exam-system.onrender.com`

---

### DigitalOcean App Platform 🌊

**Steps:**

1. **Sign up** at [digitalocean.com](https://digitalocean.com)

2. **Create App:**
   - Go to **Apps** → **Create App**
   - Connect GitHub repo

3. **Configure:**
   - Branch: `main`
   - Runtime: Node.js
   - Build command: `npm install`
   - Run command: `node server.js`

4. **Environment Variables:**
   ```
   PORT=8080
   NODE_ENV=production
   ```

5. **Persistent Storage:**
   - Add a **Volume** in the "Advanced" section
   - Mount path: `/data`
   - Size: 1GB

6. **Deploy:**
   - Your app will get a URL like: `https://offline-exam-system-apps.ondigitalocean.app`

---

### AWS EC2 ☁️

For more control, deploy to an EC2 instance.

**Steps:**

1. **Launch EC2 Instance:**
   - Amazon Linux 2023 or Ubuntu 22.04 LTS
   - t2.micro (free tier eligible)
   - Configure security group to allow:
     - Port 22 (SSH)
     - Port 80 (HTTP)
     - Port 443 (HTTPS, optional)

2. **SSH into instance:**
   ```bash
   ssh -i your-key.pem ubuntu@ec2-xx-xxx-xxx-xxx.compute-1.amazonaws.com
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Clone your repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/offline-exam-system.git
   cd offline-exam-system
   npm install
   ```

5. **Create data directory:**
   ```bash
   mkdir -p data
   ```

6. **Optional: Set up PM2 for process management:**
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name "offline-exam-system"
   pm2 save
   pm2 startup
   ```

7. **Open firewall if needed:**
   ```bash
   sudo ufw allow 3000
   ```

8. **Access:**
   - `http://EC2-PUBLIC-IP:3000/teacher`
   - `http://EC2-PUBLIC-IP:3000`

---

### VPS (Generic) 🖥️

For any Linux VPS (Linode, Vultr, Hetzner, etc.):

**Steps:**

1. SSH into your server
2. Install Node.js (LTS version)
3. Clone your repository
4. Run `npm install`
5. Start the server:
   ```bash
   node server.js
   ```
6. (Recommended) Use a process manager like PM2 or systemd
7. Configure firewall to allow port 3000
8. Access via `http://YOUR-SERVER-IP:3000`

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (cloud platforms often override this) |
| `HOST` | `0.0.0.0` | Bind address (always use `0.0.0.0` for cloud) |
| `PUBLIC_URL` | (none) | Manually set the public URL if auto-detection fails |
| `DEPLOYMENT_MODE` | `auto` | Force mode: `local` or `cloud` (usually not needed) |

### Config File (`data/config.json`)

After first run, a `data/config.json` file is created:

```json
{
  "teacherPassword": "teacher123",
  "deploymentMode": "auto",
  "publicUrl": "",
  "serverName": ""
}
```

- `teacherPassword`: Change via Teacher Dashboard → Settings
- `deploymentMode`: Override auto-detection (`local` or `cloud`)
- `publicUrl`: Manual URL override (if auto-detection fails)
- `serverName`: Optional custom server name for display

You can pre-configure this file before deployment if needed.

---

## Custom Domain

To use a custom domain (e.g., `exam.yourschool.edu`):

1. **In your cloud platform:**
   - Add custom domain in dashboard
   - Platform will provide DNS records (CNAME or A records)

2. **In your domain registrar/DNS:**
   - Add the DNS records provided by your platform
   - For A records: point to the IP address
   - For CNAME: point to the platform's domain

3. **SSL/HTTPS:** Most platforms automatically provision SSL certificates for custom domains (via Let's Encrypt).

4. **Update PUBLIC_URL:**
   - Set `PUBLIC_URL=https://exam.yourschool.edu` in environment variables
   - This ensures the system displays the correct URL

---

## SSL HTTPS

Cloud platforms automatically provide HTTPS for your domain. For custom domain setups:

- **Railway:** Automatic SSL via Let's Encrypt
- **Render:** Automatic SSL
- **DigitalOcean:** Automatic SSL
- **VPS:** Use Let's Encrypt with Certbot:
  ```bash
  sudo apt install certbot
  sudo certbot --nginx -d exam.yourschool.edu
  ```

**Important:** The system works on both HTTP and HTTPS. If students access via HTTPS, all API calls use the same protocol (no mixed content issues).

---

## Troubleshooting

### "Cannot find module 'helmet'"
```bash
npm install helmet
```

### Server starts but shows "localhost" instead of public URL
Set `PUBLIC_URL` environment variable:
```
PUBLIC_URL=https://your-app.up.railway.app
```

### Data files not persisting after restart
Make sure you have a persistent volume mounted at `/data` (or the path configured via `DATA_DIR`). Without persistent storage, JSON files are lost when the container restarts.

### Port already in use
Cloud platforms set `PORT` environment variable automatically. Don't hardcode a different port. Use `process.env.PORT`.

### Students can't connect
- Check that your server is running
- If on VPS, ensure firewall allows the port
- If using cloud platform, ensure you're using the correct URL
- Verify the teacher dashboard loads, then share the student portal URL

### File system read-only errors
On some cloud platforms (like Vercel, GitHub Pages), the file system is read-only. **This application requires a platform with writable storage** (Railway, Render, EC2, VPS). Do not use static-only hosting services.

### "This site can't be reached" after deploying
- Wait 1-2 minutes for platform to finish deployment
- Check the platform dashboard for build errors
- Verify environment variables are set correctly
- Check logs in the platform dashboard

### Local testing before deploy
Test locally with production-like settings:
```bash
PORT=3000 HOST=0.0.0.0 node server.js
```
Then access via `http://localhost:3000` from your browser.

---

## Summary

| Platform | Free Tier | Persistent Storage | Custom Domain | Ease |
|----------|-----------|-------------------|---------------|------|
| Railway | Yes | ✅ Volumes | ✅ | ⭐⭐⭐⭐⭐ |
| Render | Yes | ✅ Disk | ✅ | ⭐⭐⭐⭐⭐ |
| DigitalOcean | Limited | ✅ Volumes | ✅ | ⭐⭐⭐⭐ |
| AWS EC2 | 12mo free | ⚠️ EBS volume | ✅ | ⭐⭐⭐ |
| VPS (generic) | ~$5/mo | ✅ Full disk | ✅ | ⭐⭐⭐ |

**Recommended for beginners:** **Railway** or **Render** — easiest setup with free persistent storage.

---

## Need Help?

- Check the [SETUP-GUIDE.md](SETUP-GUIDE.md) for local/LAN usage
- See [README.md](README.md) for project overview
- Report issues on GitHub

---

**Happy Deploying! 🚀**
