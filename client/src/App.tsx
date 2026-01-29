import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import ChatPage from "./pages/ChatPage";
import DocumentsPage from "./pages/DocumentsPage";
import SettingsPage from "./pages/SettingsPage";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/chat/:conversationId" component={ChatPage} />
        <Route path="/documents" component={DocumentsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
