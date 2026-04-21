# Exam Scheduler - Project Overview

This project provides a system for managing exam schedules, organizing rooms and labs based on available capacities and time slots. The project is divided into two main parts: the Frontend and the Backend.

## 1. Frontend
- **Core Framework & Technology:** Built using **React.js** with **Vite** as the build tool to provide high performance and ultra-fast hot module replacement.
- **Language:** **JavaScript** (and JSX for building components).
- **Key Dependencies:**
  - `react-router-dom`: For flexible routing and navigation between different pages within the application.
  - `recharts`: For rendering charts and data visualization.
  - `xlsx`: For parsing Excel files (spreadsheets), extracting data, and displaying it to the user.
- **How it works:** It handles the visual representation of the application. It receives user inputs or parses imported Excel files locally, displays exam schedules and available rooms, and communicates with the Backend via REST API calls.

## 2. Backend
- **Core Framework & Technology:** Built using the **Laravel** framework.
- **Language:** **PHP**.
- **Role:** 
  - Acts as a REST API that provides the Frontend with necessary data and processes incoming requests.
  - Contains the business logic for allocating exam times, checking for room schedule conflicts, and managing data persistence.
  - API routes are defined in the `routes/api.php` file and managed via Controllers (such as the `DashboardController`).

## 3. How They Work Together
1. The **Frontend** sends an HTTP request to retrieve data or process a specific schedule.
2. The **Backend (PHP/Laravel)** receives the request, processes it, and applies business rules (like checking room capacities or verifying availability).
3. The Backend returns the processed data in JSON format back to the browser.
4. The **Frontend** takes this JSON response and dynamically renders the user interface to display the tables, schedules, and charts in a structured and easy-to-understand format.

*(Note: Obsolete backend folders have been removed from the workspace to keep the project clean. Only the active `backend-php` directory is used.)*
