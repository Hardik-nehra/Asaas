import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  User,
  Mail,
  Shield,
  FileText,
  MessageSquare,
  Clock,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  
  // Fetch user stats
  const { data: documents } = trpc.documents.list.useQuery();
  const { data: conversations } = trpc.conversations.list.useQuery();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
    } catch (error) {
      toast.error("Failed to log out");
    }
  };

  const stats = [
    {
      label: "Documents",
      value: documents?.length || 0,
      icon: FileText,
      color: "text-blue-500",
    },
    {
      label: "Conversations",
      value: conversations?.length || 0,
      icon: MessageSquare,
      color: "text-green-500",
    },
    {
      label: "Member Since",
      value: user?.createdAt
        ? new Date(user.createdAt).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })
        : "N/A",
      icon: Clock,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences.
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{user?.name || "User"}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="capitalize">
                  {user?.role || "user"}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-muted-foreground">{user?.name || "Not set"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{user?.email || "Not set"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Login Method</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {user?.loginMethod || "OAuth"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
          <CardDescription>Your activity overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center p-4 rounded-lg bg-muted/50"
              >
                <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium">Construction AI Agent</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Features</span>
              <span className="font-medium">Document Analysis, AI Chat, Calculations</span>
            </div>
          </div>

          <Separator />

          <div className="text-sm text-muted-foreground">
            <p>
              This application helps construction professionals analyze project documents,
              perform calculations, generate reports, and identify specification conflicts
              using AI-powered analysis.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sign Out</p>
              <p className="text-sm text-muted-foreground">
                Sign out of your account on this device
              </p>
            </div>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
