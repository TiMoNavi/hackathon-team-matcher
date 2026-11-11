<div align="center">

# Matcha - Brewing Your Perfect Hack Team
  
[![Watch the demo](https://img.youtube.com/vi/bx2dYwqAUJI/hqdefault.jpg)](https://youtu.be/bx2dYwqAUJI)
</div>

## About Matcha

Matcha is an **AI-powered hackathon teammate matching platform** that helps developers, designers, and innovators find their perfect team. Whether you're looking for a frontend wizard, a backend guru, or a design genius, Matcha brews the perfect team combination using advanced AI matching algorithms.

### The Problem

- **Solo hackers** struggle to find teammates with complementary skills
- **Teams** waste valuable hackathon time searching for missing roles
- **Great ideas** never ship because of incomplete teams

### Our Solution

Matcha uses **Google Gemini AI** to analyze skills, interests, and hackathon goals to create perfectly balanced teams. We scrape Devpost hackathon data, analyze participant profiles, and match you with your ideal teammates in seconds.

---

## Features

### AI-Powered Matching

- **Smart Algorithm**: Google Gemini 2.5-flash analyzes skills, interests, and goals
- **Personalized Results**: Get teammates that complement your skillset
- **Real-time Matching**: Find your team in seconds, not hours

### Beautiful UI/UX

- **Animated Landing Page**: Eye-catching hero section with smooth animations
- **3D Testimonials**: Interactive testimonial carousel
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Modern Aesthetics**: Built with TailwindCSS for a sleek, professional look

### Secure Authentication

- **Auth0 Integration**: Industry-standard OAuth authentication
- **JWT Tokens**: Secure session management
- **Password Recovery**: Email-based password reset flow

### Profile Management

- **Two-Step Setup**: Easy onboarding process
- **Skills Tags**: Add your technical skills
- **Project Ideas**: Share what you want to build
- **Hackathon Goals**: Define your objectives

### Smart Features

- **Devpost Scraping**: Automatically fetch participant data from hackathons
- **Survey System**: Collect detailed information about hackers
- **Team Dashboard**: Manage your matched teams
- **Messaging**: Communicate with potential teammates
- **Idea Board**: Share and collaborate on project concepts

---

## Tech Stack

### Frontend

- **React 18.2** - Modern UI library
- **Vite 5.0** - Lightning-fast build tool
- **React Router 6.20** - Client-side routing
- **TailwindCSS 3.3** - Utility-first CSS framework
- **Auth0 React** - Authentication SDK
- **Material Icons** - Icon library

### Backend (Python/Flask)

- **Flask 3.0** - Lightweight web framework
- **Flask-CORS** - Cross-origin resource sharing
- **PyMongo 4.6** - MongoDB driver
- **Selenium 4.16** - Web scraping automation
- **BeautifulSoup4 4.12** - HTML parsing
- **Google Generative AI** - Gemini API integration
- **Python-dotenv** - Environment variable management

### Backend (Node.js/Express)

- **Express 5.2** - Web application framework
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **Nodemailer** - Email sending
- **Cors** - CORS middleware

### Database

- **MongoDB Atlas** - Cloud-hosted NoSQL database
- **File System** - JSON-based user storage

### DevOps

- **Git** - Version control
- **GitHub** - Code hosting
- **npm** - Package management
- **pip** - Python package management

---

## Project Structure

```
Matcha/
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── assets/             # Images, videos, static files
│   │   ├── auth/               # Auth0 configuration
│   │   ├── components/         # Reusable React components
│   │   │   ├── Layout.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── context/            # React Context providers
│   │   │   └── AuthContext.jsx
│   │   ├── pages/              # Page components
│   │   │   ├── Landing.jsx     # Animated landing page
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ProfileSetupStep1.jsx
│   │   │   ├── ProfileSetupStep2.jsx
│   │   │   ├── Survey.jsx      # Hackathon survey
│   │   │   ├── Brewing.jsx     # AI matching page
│   │   │   ├── BrewResults.jsx # Match results
│   │   │   ├── Team.jsx        # Team management
│   │   │   ├── Ideas.jsx       # Project ideas board
│   │   │   ├── Messages.jsx
│   │   │   └── Settings.jsx
│   │   ├── services/
│   │   │   └── api.js          # API client
│   │   ├── utils/              # Utility functions
│   │   │   ├── userStorage.js
│   │   │   ├── teamStorage.js
│   │   │   └── ideaStorage.js
│   │   ├── App.jsx             # Main app component
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Global styles
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/                     # Python Flask backend
│   ├── app.py                  # Main Flask application
│   ├── teammate_matcher.py     # AI matching logic
│   ├── scraper_selenium.py     # Devpost scraper
│   ├── upload_to_mongodb.py    # Database utilities
│   ├── requirements.txt        # Python dependencies
│   └── templates/
│       └── index.html
│
├── server/                      # Node.js authentication backend
│   ├── index.js                # Express server
│   ├── middleware/
│   │   └── auth.js             # JWT middleware
│   └── routes/
│       ├── auth.js             # Authentication routes
│       └── users.js            # User management routes
│
└── README.md
```

---

## Quick Start

For developers who want to get started immediately:

```bash
# 1. Clone the repository
git clone https://github.com/Siriapps/Matcha.git
cd Matcha

# 2. Install dependencies
cd frontend && npm install
cd ../backend && pip install -r requirements.txt

# 3. Setup environment variables
cd backend
cp .env.example .env
# Edit .env with your credentials (see detailed setup below)

# 4. Run the application
# Terminal 1 - Backend
cd backend && python app.py

# Terminal 2 - Frontend
cd frontend && npm run dev

# 5. Open http://localhost:5173 in your browser
```

⚠️ **Important:** You must configure your `.env` file with valid API keys before running the app. See the detailed setup guide below.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.12.0 recommended) - [Download](https://www.python.org/)
- **pyenv** (for Python version management) - [Install guide](https://github.com/pyenv/pyenv#installation)
- **Git** - [Download](https://git-scm.com/)
- **MongoDB Atlas Account** - [Sign up](https://www.mongodb.com/cloud/atlas) (free tier available)

### Required API Keys

You'll need the following API keys:

1. **MongoDB Atlas URI** - Database connection string
2. **Google Gemini API Key** - For AI matching ([Get it here](https://makersuite.google.com/app/apikey))
3. **Auth0 Credentials** - Authentication ([Create free account](https://auth0.com/))
4. **Devpost Cookies** - For scraping participant data (see detailed guide below)

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Siriapps/Matcha.git
cd Matcha
```

### 2. Setup Frontend

```bash
cd frontend
npm install
```

### 3. Setup Python Backend

```bash
cd ../backend
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 4. Environment Variables

#### Backend Environment Setup

Create a `.env` file in the `backend/` directory. You can use the provided `.env.example` as a template:

```bash
cd backend
cp .env.example .env
```

Edit the `.env` file with your actual credentials:

```env
# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=YourApp
DATABASE_NAME=devpost_data
COLLECTION_NAME=participants

# Devpost Authentication Cookies
# To get these values:
# 1. Log in to Devpost in your browser
# 2. Open Developer Tools (F12) > Application > Cookies > devpost.com
# 3. Copy the values for each cookie below
DEVPOST_JWT=your_jwt_token_here
DEVPOST_REMEMBER_USER_TOKEN=your_remember_user_token_here
DEVPOST_SESSION=your_devpost_session_cookie_here
DEVPOST_AWS_WAF_TOKEN=your_aws_waf_token_here
DEVPOST_GA=your_google_analytics_cookie_here

# Auth0 Configuration (for frontend)
VITE_AUTH0_DOMAIN=your_auth0_domain.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_client_id_here
```

#### How to Get Devpost Cookies:

1. Open your browser and navigate to [devpost.com](https://devpost.com)
2. Log in to your Devpost account
3. Open Developer Tools (press `F12` or right-click → Inspect)
4. Go to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
5. In the left sidebar, expand **Cookies** and click on `https://devpost.com`
6. Find and copy the values for:
   - `jwt`
   - `remember_user_token`
   - `_devpost`
   - `aws-waf-token`
   - `_ga`
7. Paste these values into your `.env` file

#### How to Get Google Gemini API Key:

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the generated key
5. Paste it as the value for `GEMINI_API_KEY` in your `.env` file

**Note:** The free tier has rate limits (20 requests/day for `gemini-2.5-flash`). Consider upgrading if you need more.

#### How to Get MongoDB Atlas URI:

1. Sign up for [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier available)
2. Create a new cluster
3. Click **"Connect"** on your cluster
4. Choose **"Connect your application"**
5. Copy the connection string (looks like `mongodb+srv://username:password@cluster.mongodb.net/`)
6. Replace `<username>` and `<password>` with your database credentials
7. Paste it as the value for `MONGODB_URI` in your `.env` file

#### How to Get Auth0 Credentials:

1. Sign up for [Auth0](https://auth0.com/) (free tier available)
2. Create a new application (choose "Single Page Application")
3. Go to your application settings
4. Copy the **Domain** and **Client ID**
5. Add `http://localhost:5173` to **Allowed Callback URLs**
6. Add `http://localhost:5173` to **Allowed Logout URLs**
7. Add `http://localhost:5173` to **Allowed Web Origins**
8. Paste the values into your `.env` file

#### Frontend Environment Setup (Optional)

If you want to override frontend-specific variables, create a `.env` file in the `frontend/` directory:

```env
# Auth0 Configuration
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your_client_id

# API URLs
VITE_API_URL=http://localhost:5000
```

**Important Security Notes:**

- ⚠️ **Never commit `.env` files to Git!** They contain sensitive credentials.
- ✅ The `.gitignore` file is already configured to exclude `.env` files.
- ✅ Use `.env.example` to document required variables (without real values).

---

## Running the Application

### Option 1: Run All Services Separately

**Terminal 1 - Flask Backend (Python):**

```bash
cd backend

# Activate virtual environment first
# On Windows:
venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate

# Start the Flask server
# The start.sh script ensures Python 3.12.0 is used
npm start
# OR directly with Python:
python app.py

# Server runs on http://127.0.0.1:5000
```

**Terminal 2 - Frontend (React + Vite):**

```bash
cd frontend
npm run dev
# Server runs on http://localhost:5173
```

**Terminal 3 - Auth Backend (Node.js)** _(Optional)_:

```bash
cd server
node index.js
# Server runs on http://localhost:3001
```

### Option 2: Run Frontend & Node Backend Together

```bash
cd frontend
npm run dev:all
# Runs both Vite dev server and Node.js auth server
```

### Access the Application

Open your browser and navigate to:

- **Frontend**: http://localhost:5173
- **Flask Backend**: http://127.0.0.1:5000
- **Node Backend**: http://localhost:3001

### Troubleshooting

#### Python Version Issues

If you encounter errors related to Python version:

```bash
# Make sure you're using Python 3.12.0
cd backend
pyenv install 3.12.0  # Install if not already installed
pyenv local 3.12.0    # Set for this project
./start.sh            # Use the startup script
```

#### Port Already in Use

If port 5000 or 5173 is already in use:

```bash
# Find and kill the process using the port (macOS/Linux)
lsof -ti:5000 | xargs kill -9
lsof -ti:5173 | xargs kill -9

# On Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

#### Module Not Found Errors

If you get `ModuleNotFoundError`:

```bash
# Reinstall Python dependencies
cd backend
pip install -r requirements.txt

# Reinstall Node dependencies
cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

#### Gemini API Rate Limit

If you hit the Gemini API rate limit (429 error):

- Free tier: 20 requests/day for `gemini-2.5-flash`
- Solution: Wait 24 hours or upgrade to a paid plan
- Alternative: Switch to `gemini-1.5-flash` in [app.py:493](backend/app.py#L493) (better rate limits)

---

---

## Key Features Walkthrough

### 1. **Landing Page**

- Animated hero section with gradient background
- Auto-scrolling 3D testimonials
- Smooth scroll-to-section navigation
- Responsive design for all devices

### 2. **Authentication Flow**

- Sign up with email/password or OAuth (Auth0)
- Email verification
- Password reset via email
- Secure JWT-based sessions

### 3. **Profile Setup**

- **Step 1**: Basic information (name, university, major)
- **Step 2**: Skills, interests, and hackathon goals
- Tag-based input for easy skill selection

### 4. **Survey System**

- Collect detailed hacker information
- Dynamic form validation
- Save responses to database

### 5. **AI Matching (Brewing)**

- Select hackathon and preferences
- AI analyzes all participants
- Real-time matching with progress animation
- Match scores and reasoning provided

### 6. **Results Page**

- View matched teammates
- See compatibility scores
- Export team data
- Contact matched members

### 7. **Team Dashboard**

- Manage current teams
- Track project progress
- Invite new members
- Team chat integration

### 8. **Ideas Board**

- Browse project ideas
- Submit your own ideas
- Upvote interesting projects
- Find teams for ideas

---

## Team

- **Siri**
- **Nikhil**
- **Karthik**

---
