"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Sparkles, Users, Users2, Bell, User, Menu, Settings, LogOut, Calendar, MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/ai-match", label: "AI Match", icon: Sparkles },
  { href: "/network", label: "Network", icon: Users },
  { href: "/communities", label: "Communities", icon: Users2 },
];

export function Navigation() {
  const pathname = usePathname();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifications = [
    { id: 1, type: "deadline", message: "NeurIPS 2026 deadline in 165 days", time: "2 hours ago" },
    { id: 2, type: "match", message: "New conference match for your paper", time: "1 day ago" },
    { id: 3, type: "community", message: "New post in AI & ML community", time: "2 days ago" },
  ];

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">R</span>
              </div>
              <span className="text-xl font-bold text-foreground">Researchly</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            {/* Notifications Dropdown */}
            <DropdownMenu open={notificationOpen} onOpenChange={setNotificationOpen}>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-accent rounded-full" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.map((notif) => (
                  <DropdownMenuItem key={notif.id} className="flex flex-col items-start py-3 cursor-pointer" onClick={() => setNotificationOpen(false)}>
                    <div className="flex items-start gap-2 w-full">
                      {notif.type === "deadline" && <Calendar className="h-4 w-4 text-accent mt-0.5" />}
                      {notif.type === "match" && <Sparkles className="h-4 w-4 text-accent mt-0.5" />}
                      {notif.type === "community" && <MessageSquare className="h-4 w-4 text-accent mt-0.5" />}
                      <div className="flex-1">
                        <p className="text-sm">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => { setNotificationOpen(false); window.location.href = '/applications'; }}>
                  View all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile Dropdown */}
            <DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      JD
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-semibold">John Doe</span>
                    <span className="text-xs text-muted-foreground">PhD Candidate, MIT</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => { setProfileOpen(false); window.location.href = '/profile'; }}>
                  <User className="h-4 w-4 mr-2" />
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => { setProfileOpen(false); window.location.href = '/profile'; }}>
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => { setProfileOpen(false); window.location.href = '/applications'; }}>
                  <Calendar className="h-4 w-4 mr-2" />
                  My Applications
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => { setProfileOpen(false); window.location.href = '/institution'; }}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Institution Hub
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex items-center gap-2 text-destructive cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                  <Badge variant="outline" className="ml-auto text-xs">Phase 5</Badge>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
