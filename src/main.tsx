import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { AcademyProvider } from "./contexts/AcademyContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { db } from "./lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

window.addEventListener("error", (event) => {
  console.error(
    "Global error caught:",
    event.message,
    event.filename,
    event.lineno,
    event.colno,
    event.error,
  );
  
  try {
    const errorLogsRef = collection(db, "error_logs");
    addDoc(errorLogsRef, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
      type: "uncaughtException",
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to log error to Firestore:", e);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  
  try {
    const errorLogsRef = collection(db, "error_logs");
    addDoc(errorLogsRef, {
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
      type: "unhandledRejection",
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to log unhandled rejection to Firestore:", e);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AcademyProvider>
          <LanguageProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </LanguageProvider>
        </AcademyProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Force rebuild for Firebase Deploy
