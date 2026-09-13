/* FILE GUIDE:
 * client/src/main.jsx
 * Purpose: Client entry point. Boots React and wraps the app with providers.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./styles/tailwind.css";
import "./styles/base.css";
import "./styles/refresh-public.css";
import "./styles/plans-admin-teacher.css";
import "./styles/builder-sessions-bank.css";
import "./styles/host-assignment.css";
import "./styles/builder-host-analytics.css";
import "./styles/analytics-tutorials.css";
import "./styles/builder-modern.css";
import "./styles/host-builder-system.css";
import "./styles/builder-interactions.css";
import "./styles/student-mobile-sheets.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
