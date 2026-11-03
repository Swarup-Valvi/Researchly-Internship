import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, MessageSquare, TrendingUp, AlertCircle } from "lucide-react";

export default function CommunitiesPage() {
  const communities = [
    { name: "Artificial Intelligence & Machine Learning", members: "12.5k", posts: "2.3k", icon: "🤖" },
    { name: "Computer Vision", members: "8.2k", posts: "1.8k", icon: "👁️" },
    { name: "Natural Language Processing", members: "6.7k", posts: "1.2k", icon: "💬" },
    { name: "Data Science & Analytics", members: "9.1k", posts: "1.5k", icon: "📊" },
    { name: "Cybersecurity", members: "5.4k", posts: "980", icon: "🔒" },
    { name: "Robotics & Automation", members: "4.8k", posts: "890", icon: "🤖" },
    { name: "Bioinformatics", members: "3.9k", posts: "720", icon: "🧬" },
    { name: "Quantum Computing", members: "2.1k", posts: "450", icon: "⚛️" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Research Communities</h1>
          <p className="text-muted-foreground">Join topic-based communities and engage with researchers in your field</p>
        </div>

        {/* Demo Notice */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Community features require authentication. Demo content shown below. Full community system coming in Phase 5.
          </AlertDescription>
        </Alert>

        {/* Communities Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {communities.map((community) => (
            <CommunityCard key={community.name} {...community} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CommunityCard({ name, members, posts, icon }: { name: string; members: string; posts: string; icon: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="text-4xl mb-2">{icon}</div>
        <CardTitle className="text-lg">{name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {members}
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            {posts}
          </div>
        </div>
        <Button className="w-full" variant="outline" disabled>
          Join Community
          <Badge variant="outline" className="ml-auto text-xs">Phase 5</Badge>
        </Button>
      </CardContent>
    </Card>
  );
}
