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
/* Bundled Inter webfont (self-hosted, offline-safe) so type looks identical
   on every phone and desktop regardless of system fonts. Latin + latin-ext
   subsets cover English and Filipino (Ññ); other subsets are skipped. */
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-ext-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-ext-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/inter/latin-ext-800.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource/inter/latin-ext-900.css";
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
import "./styles/fluid-responsive.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
