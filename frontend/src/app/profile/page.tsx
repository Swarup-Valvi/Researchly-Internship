import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Mail, MapPin, Building, ExternalLink, Edit, Award, FileText, Users, AlertCircle } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">JD</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold">John Doe</h1>
                    <p className="text-muted-foreground">PhD Candidate</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" disabled>
                    <Edit className="h-4 w-4" />
                    Edit Profile
                    <Badge variant="outline" className="ml-auto text-xs">Phase 5</Badge>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    Massachusetts Institute of Technology
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Cambridge, MA
                  </div>
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    john.doe@mit.edu
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Notice */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Profile editing requires authentication. Demo content shown below. Full profile system coming in Phase 5.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="about" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="publications">Publications</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Research Interests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Computer Vision</Badge>
                  <Badge variant="secondary">Deep Learning</Badge>
                  <Badge variant="secondary">Self-Supervised Learning</Badge>
                  <Badge variant="secondary">Transformers</Badge>
                  <Badge variant="secondary">Contrastive Learning</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Education</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">PhD in Computer Science</p>
                  <p className="text-sm text-muted-foreground">Massachusetts Institute of Technology | 2022 - Present</p>
                </div>
                <Separator />
                <div>
                  <p className="font-medium">MS in Computer Science</p>
                  <p className="text-sm text-muted-foreground">Stanford University | 2020 - 2022</p>
                </div>
                <Separator />
                <div>
                  <p className="font-medium">BS in Computer Engineering</p>
                  <p className="text-sm text-muted-foreground">University of California, Berkeley | 2016 - 2020</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-start gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full"
                >
                  <ExternalLink className="h-4 w-4" />
                  Google Scholar
                </a>
                <a
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-start gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full"
                >
                  <ExternalLink className="h-4 w-4" />
                  ORCID
                </a>
                <a
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-start gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full"
                >
                  <ExternalLink className="h-4 w-4" />
                  GitHub
                </a>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="publications" className="space-y-4 mt-6">
            <PublicationCard
              title="Self-Supervised Visual Representation Learning with Contrastive Transformers"
              venue="NeurIPS 2025"
              year={2025}
              citations={24}
            />
            <PublicationCard
              title="Efficient Transformer Architectures for Computer Vision"
              venue="CVPR 2024"
              year={2024}
              citations={45}
            />
            <PublicationCard
              title="A Survey of Self-Supervised Learning in Vision"
              venue="IEEE TPAMI"
              year={2024}
              citations={89}
            />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 mt-6">
            <ActivityCard
              type="submission"
              title="Submitted to ICML 2026"
              date="2 weeks ago"
              status="Under Review"
            />
            <ActivityCard
              type="acceptance"
              title="Paper accepted at NeurIPS 2025"
              date="1 month ago"
              status="Accepted"
            />
            <ActivityCard
              type="presentation"
              title="Presented at CVPR 2025"
              date="3 months ago"
              status="Presented"
            />
          </TabsContent>

          <TabsContent value="connections" className="space-y-4 mt-6">
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Connection features coming in Phase 5</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PublicationCard({ title, venue, year, citations }: { title: string; venue: string; year: number; citations: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-2">{venue} • {year}</p>
        <div className="flex items-center gap-2 text-sm">
          <Award className="h-4 w-4 text-accent" />
          <span className="text-muted-foreground">{citations} citations</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ type, title, date, status }: { type: string; title: string; date: string; status: string }) {
  const getIcon = () => {
    switch (type) {
      case "submission":
        return <FileText className="h-5 w-5" />;
      case "acceptance":
        return <Award className="h-5 w-5 text-success" />;
      case "presentation":
        return <Users className="h-5 w-5" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="mt-1">{getIcon()}</div>
          <div className="flex-1">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{date}</p>
          </div>
          <Badge variant="outline">{status}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
