import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Search, Sparkles, Users, Calendar, MapPin, ExternalLink, ThumbsUp, MessageSquare, Share2, MoreHorizontal, Briefcase, GraduationCap, BookOpen, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar - Profile & Navigation */}
          <div className="hidden lg:block lg:col-span-3 space-y-4">
            <ProfileCard />
            <NavigationCard />
          </div>

          {/* Center - Feed */}
          <div className="col-span-1 lg:col-span-6 space-y-4">
            <CreatePostCard />
            <FeedPost
              author="Dr. Sarah Chen"
              institution="MIT"
              avatar="SC"
              time="2 hours ago"
              content="Excited to share our latest work on self-supervised visual representation learning! We propose a novel framework for contrastive transformers that achieves state-of-the-art results on ImageNet. Paper is now available on arXiv. #ComputerVision #DeepLearning"
              likes={42}
              comments={8}
            />
            <FeedPost
              author="Prof. Michael Roberts"
              institution="Stanford"
              avatar="MR"
              time="5 hours ago"
              content="Just submitted our paper to NeurIPS 2026. The matching system on Researchly was incredibly helpful in finding the right venue. Highly recommend checking out the AI Match feature if you're looking for conference recommendations!"
              likes={28}
              comments={12}
            />
            <FeedPost
              author="Dr. Emily Watson"
              institution="Oxford"
              avatar="EW"
              time="1 day ago"
              content="Our paper on transformer architectures for NLP has been accepted at ACL 2026! Thank you to everyone who provided feedback during the review process. Looking forward to presenting in Vienna."
              likes={89}
              comments={23}
            />
          </div>

          {/* Right Sidebar - Deadlines & Recommendations */}
          <div className="hidden lg:block lg:col-span-3 space-y-4">
            <UpcomingDeadlines />
            <RecommendedConferences />
            <SuggestedResearchers />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileCard() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center">
          <Avatar className="h-16 w-16 mx-auto mb-3">
            <AvatarFallback className="bg-primary text-primary-foreground text-xl">JD</AvatarFallback>
          </Avatar>
          <h3 className="font-semibold">John Doe</h3>
          <p className="text-sm text-muted-foreground">PhD Candidate</p>
          <p className="text-sm text-muted-foreground">Massachusetts Institute of Technology</p>
          <Separator className="my-3" />
          <div className="flex justify-around text-sm">
            <div>
              <p className="font-semibold">156</p>
              <p className="text-muted-foreground">Connections</p>
            </div>
            <div>
              <p className="font-semibold">12</p>
              <p className="text-muted-foreground">Publications</p>
            </div>
            <div>
              <p className="font-semibold">5</p>
              <p className="text-muted-foreground">Communities</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NavigationCard() {
  const navItems = [
    { icon: <Users className="h-5 w-5" />, label: "My Network", count: 5 },
    { icon: <Briefcase className="h-5 w-5" />, label: "Applications", count: 2 },
    { icon: <BookOpen className="h-5 w-5" />, label: "Publications", count: 12 },
    { icon: <TrendingUp className="h-5 w-5" />, label: "Stats", count: null },
  ];

  return (
    <Card>
      <CardContent className="pt-4">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.label === "My Network" ? "/network" : item.label === "Applications" ? "/applications" : "#"}
            className="flex items-center justify-between py-3 hover:bg-secondary/50 rounded px-2 -mx-2 transition-colors"
          >
            <div className="flex items-center gap-3">
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            {item.count !== null && <Badge variant="secondary">{item.count}</Badge>}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function CreatePostCard() {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">JD</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="Share your research, ask a question, or post an update..."
              className="min-h-[80px] resize-none"
            />
            <div className="flex justify-between items-center mt-3">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Sparkles className="h-4 w-4 mr-1" />
                  AI Assist
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Link
                </Button>
              </div>
              <Button size="sm" className="bg-accent hover:bg-accent/90">
                Post
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedPost({
  author,
  institution,
  avatar,
  time,
  content,
  likes,
  comments,
}: {
  author: string;
  institution: string;
  avatar: string;
  time: string;
  content: string;
  likes: number;
  comments: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground">{avatar}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{author}</h3>
              <p className="text-sm text-muted-foreground">{institution}</p>
              <p className="text-xs text-muted-foreground">{time}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed mb-4">{content}</p>
        <Separator className="my-4" />
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" className="gap-2">
            <ThumbsUp className="h-4 w-4" />
            {likes}
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            {comments}
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingDeadlines() {
  const deadlines = [
    { conference: "NeurIPS 2026", deadline: "May 21, 2026", days: 165 },
    { conference: "ICML 2027", deadline: "Jan 28, 2027", days: 424 },
    { conference: "CVPR 2026", deadline: "Nov 14, 2025", days: -52 },
  ];

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-accent" />
          Upcoming Deadlines
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {deadlines.map((item) => (
          <div key={item.conference} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="text-sm font-medium">{item.conference}</p>
              <p className="text-xs text-muted-foreground">{item.deadline}</p>
            </div>
            <Badge variant={item.days > 0 ? "outline" : "destructive"}>
              {item.days > 0 ? `${item.days} days` : "Passed"}
            </Badge>
          </div>
        ))}
        <Link href="/discover">
          <Button variant="outline" size="sm" className="w-full mt-2">
            View All
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RecommendedConferences() {
  const conferences = [
    { name: "ICML 2027", location: "Vienna, Austria", match: "92%" },
    { name: "ACL 2026", location: "Vienna, Austria", match: "87%" },
    { name: "CVPR 2026", location: "Seattle, USA", match: "85%" },
  ];

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          Recommended
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {conferences.map((conf) => (
          <div key={conf.name} className="py-2 border-b last:border-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{conf.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {conf.location}
                </div>
              </div>
              <Badge className="bg-accent">{conf.match}</Badge>
            </div>
          </div>
        ))}
        <Link href="/ai-match">
          <Button variant="outline" size="sm" className="w-full mt-2 gap-2">
            <Sparkles className="h-4 w-4" />
            AI Match
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function SuggestedResearchers() {
  const researchers = [
    { name: "Dr. Sarah Chen", institution: "MIT", area: "Computer Vision" },
    { name: "Prof. Michael Roberts", institution: "Stanford", area: "ML" },
    { name: "Dr. Emily Watson", institution: "Oxford", area: "NLP" },
  ];

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          Suggested
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {researchers.map((researcher, idx) => (
          <div key={researcher.name} className="flex items-center gap-3 py-2 border-b last:border-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {researcher.name.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{researcher.name}</p>
              <p className="text-xs text-muted-foreground truncate">{researcher.institution}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Users className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Link href="/network">
          <Button variant="outline" size="sm" className="w-full mt-2">
            View Network
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
