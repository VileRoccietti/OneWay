# 🛡️ One Way System | TSB Competitive Core

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-PRODUCTION-green?style=for-the-badge)
![Stack](https://img.shields.io/badge/tech-Node.js%20%7C%20Discord.js%20v14-339933?style=for-the-badge)

**One Way System** is a bespoke, high-performance discord automation solution engineered specifically for **One Way**, a Top 19 LATAM competitive clan in *The Strongest Battlegrounds* (Roblox).

This bot serves as the central command unit for clan operations, bridging the gap between competitive gameplay, roster management, and administrative logistics using a proprietary local database architecture.

## 🚀 Key Features

### ⚔️ Competitive Engines
* **Crew Battle Manager (5v5):** Implements "Survivor/Gauntlet" logic with live embed updates. Tracks stocks (lives), manages player rotation automatically, and calculates MVP based on stock differential.
* **Gladiator System (1v1):** Specialized referee tools for official duels, including an automated **12-second Passive Timer** and a "Strike" system to enforce aggressive playstyles (Anti-Passive rules).

### 📊 TSBL Ranking & Roster
* **Phase & Tier Management:** Strict adherence to TSBL standards (Phase 0-5, Tier High/Mid/Low, Sub-Tier).
* **Intelligent Roster:** Real-time visualization of the **Main Lineup** and **Sub Lineup**, integrating Discord presence (Online/DND/Offline) to assess war readiness instantly.
* **Automated Promotion:** Handles nickname standardization (e.g., `[P2-H-S] Username`) and role synchronization upon rank updates.

### 💾 Proprietary Architecture (`.oneway`)
* **Custom File System:** Instead of traditional SQL/NoSQL databases, this project utilizes a custom-built, low-latency local storage engine (`.oneway` files) for instant data retrieval and zero-dependency deployment.
* **Data Integrity:** Includes transactional writing safety and automated backups for user profiles, war logs, and blacklists.

### 🛡️ Security & Automation
* **Sentinel Blacklist:** Auto-bans blacklisted users upon server entry to protect clan integrity.
* **Activity Cron:** Automated daily activity checks (GMT-5) to filter inactive members and maintain a high-performance roster.
* **Audit Logging:** Comprehensive logging of all administrative actions, from rank changes to force-wins in scrims.

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Discord.js (v14)
* **Persistence:** Native FS (FileSystem) with Custom JSON Parsing
* **Scheduling:** Node-Cron

## 📂 Project Structure

```bash
One-Way-Bot/
├── commands/           # Command modules (Combat, Admin, Roster)
├── utils/
│   └── dbManager.js    # Custom .oneway file handler
├── data/               # Local Database Storage
│   ├── users.oneway    # Player stats & profiles
│   ├── wars.oneway     # Match history logs
│   └── settings.oneway # Server config & role IDs
├── index.js            # Entry point & Event Handlers
└── config.json         # Environmental variables
