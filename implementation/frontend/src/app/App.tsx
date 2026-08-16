import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { AppProvider } from "./lib/store";
import { AppShell } from "./components/layout/AppShell";
import { UploadPage } from "./components/pages/UploadPage";
import { JobsPage } from "./components/pages/JobsPage";
import { JobDetailPage } from "./components/pages/JobDetailPage";
import { DestinationsPage } from "./components/pages/DestinationsPage";
import { SettingsPage } from "./components/pages/SettingsPage";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppProvider>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/upload" replace />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:jobId" element={<JobDetailPage />} />
                <Route path="/destinations" element={<DestinationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/upload" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
