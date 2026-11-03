import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, UserPlus, Mail, AlertCircle } from "lucide-react";

export default function NetworkPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Research Network</h1>
          <p className="text-muted-foreground">Connect with researchers and build your academic network</p>
        </div>

        {/* Demo Notice */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Networking features require authentication. Demo content shown below. Full connection system coming in Phase 5.
          </AlertDescription>
        </Alert>

        {/* Search */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input placeholder="Search researchers by name, institution, or research area..." className="pl-10 h-12" disabled />
          </div>
        </div>

        {/* Suggested Connections */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Suggested Connections</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ResearcherCard name="Dr. Sarah Chen" institution="MIT" area="Computer Vision" />
            <ResearcherCard name="Prof. Michael Roberts" institution="Stanford" area="Machine Learning" />
            <ResearcherCard name="Dr. Emily Watson" institution="Oxford" area="Natural Language Processing" />
          </div>
        </div>

        {/* All Researchers */}
        <div>
          <h2 className="text-xl font-semibold mb-4">All Researchers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ResearcherCard name="Dr. James Liu" institution="CMU" area="Robotics" />
            <ResearcherCard name="Prof. Anna Kim" institution="Berkeley" area="AI Ethics" />
            <ResearcherCard name="Dr. David Park" institution="Georgia Tech" area="Computer Networks" />
            <ResearcherCard name="Prof. Lisa Johnson" institution="ETH Zurich" area="Data Science" />
            <ResearcherCard name="Dr. Robert Williams" institution="University of Toronto" area="Deep Learning" />
            <ResearcherCard name="Prof. Maria Garcia" institution="Tsinghua University" area="Computer Vision" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearcherCard({ name, institution, area }: { name: string; institution: string; area: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("");
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-lg">{name}</CardTitle>
            <p className="text-sm text-muted-foreground">{institution}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant="secondary">{area}</Badge>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-2" disabled>
            <UserPlus className="h-4 w-4" />
            Connect
            <Badge variant="outline" className="ml-auto text-xs">Phase 5</Badge>
          </Button>
          <Button size="sm" variant="outline" disabled>
            <Mail className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
