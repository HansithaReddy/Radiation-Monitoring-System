# Full Stack Radiation Monitoring System  
### Real-Time Radiation Monitoring • Firestore Storage • Admin Analytics Dashboard

A complete web-based **Radiation Monitoring System** built using **Node.js**, **Express.js**, **Firebase Authentication**, and **Firestore Database**. This system automates radiation data collection, provides real-time analytics, and allows admins to monitor radiation levels efficiently with alerts.


## 🚀 Features

- **Firebase Authentication** (Email/Password)
- **Role-Based Access** (Admin/User)
- **Radiation Data Entry** with cascading dropdowns (Block → Plant → Area → Area Spec)
- **Firestore Real-Time Database**
- **Admin Dashboard** with:
  - Filters (block/plant/area/date)
  - Min/Max/Average statistics
  - Chart.js visualizations
  - Export: CSV & JSON
- **Email Alerts** for threshold breaches (via SMTP)
- **Responsive UI** using Bootstrap 5
- **Smart Threshold Matching** (Uses area spec for generic areas)


## 🛠️ Tech Stack

### **Frontend**
- HTML5, CSS3, JavaScript (ES6)
- Bootstrap 5
- Chart.js
- Firebase Client SDK

### **Backend**
- Node.js
- Express.js
- Firebase Admin SDK
- Nodemailer (SMTP email alerts)
- express-session

### **Database**
- Firebase Firestore


## 📁 Folder Structure

radiation-monitoring-system/
│
├── app.js
├── firebase-admin-config.js
├── service-account-key.json # Ignored from Git
├── .env # Ignored from Git
│
├── public/
│ ├── index.html # Login/Register
│ ├── user.html # User Dashboard
│ ├── retrieve.html # Admin Dashboard
│ └── client.js
│
└── package.json


## 🔧 Installation
# Clone the Repository
```bash
git clone <repository-url>
cd radiation-monitoring-system
```
# Install Dependencies
```bash
npm install
```


# 🔥 Firebase Setup

## ✔ Step 1: Create a Firebase Project
Create a project in Firebase Console:  
https://console.firebase.google.com/

Enable:
- Firestore Database  
- Authentication → Email/Password  

## ✔ Step 2: Download Firebase Admin SDK Key
Go to:  
**Project Settings → Service Accounts → Generate New Private Key**

Save it as:
```
service-account-key.json
```

## ✔ Step 3: Add Firebase Web Config to `.env`
Create `.env` file and add:

```env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```


# ⚙️ Backend Environment Variables
Create `.env` file for backend:

```env
NODE_ENV=development
PORT=3000

# Firebase (client config)
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id

# SMTP (email alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# Session management
SESSION_SECRET=change-this-secret
```


# ▶️ Run the Server

## Normal Run
```bash
npm start
```

## Development Mode (auto reload)
```bash
npm run dev
```

Open in browser:
```
http://localhost:3000
```


# 🖥️ UI Screens

## 🔐 Login/Register – `index.html`
- Firebase Authentication  
- Clean modern toggle UI  

## 🧍 User Dashboard – `user.html`
- Radiation data entry  
- Cascading dropdowns  
- Auto date  
- Realtime Firestore insert  
- Toast alerts  

## 👨‍💼 Admin Dashboard – `retrieve.html`
- Filter by block/plant/area/date  
- Firestore data table  
- Chart.js analytics  
- Min/Max/Average calculations  
- Export CSV / JSON  