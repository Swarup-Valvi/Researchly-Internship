import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Calendar, TrendingUp, Award, AlertCircle } from "lucide-react";

export default function InstitutionPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Institution Hub</h1>
          <p className="text-muted-foreground">Department overview and research activity dashboard</p>
        </div>

        {/* Demo Notice */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Institution Hub requires authentication and department access. Demo content shown below. Full institution system coming in Phase 5.
          </AlertDescription>
        </Alert>

        {/* Stats Overview */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Researchers" value="47" icon={<Users className="h-5 w-5" />} />
          <StatCard title="Active Submissions" value="23" icon={<Calendar className="h-5 w-5" />} />
          <StatCard title="Acceptances (2025)" value="18" icon={<Award className="h-5 w-5" />} />
          <StatCard title="Publications" value="156" icon={<TrendingUp className="h-5 w-5" />} />
        </div>

        {/* Recent Activity */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recent Conference Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ActivityItem
                researcher="Dr. Sarah Chen"
                conference="NeurIPS 2026"
                status="Submitted"
                date="2 days ago"
              />
              <ActivityItem
                researcher="Prof. Michael Roberts"
                conference="ICML 2026"
                status="Accepted"
                date="1 week ago"
              />
              <ActivityItem
                researcher="Dr. Emily Watson"
                conference="CVPR 2026"
                status="Under Review"
                date="2 weeks ago"
              />
              <ActivityItem
                researcher="Dr. James Liu"
                conference="ACL 2026"
                status="Preparing"
                date="3 weeks ago"
              />
            </div>
          </CardContent>
        </Card>

        {/* Top Researchers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Researchers This Year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ResearcherRow name="Dr. Sarah Chen" publications={8} acceptances={5} />
              <ResearcherRow name="Prof. Michael Roberts" publications={12} acceptances={7} />
              <ResearcherRow name="Dr. Emily Watson" publications={6} acceptances={4} />
              <ResearcherRow name="Dr. James Liu" publications={5} acceptances={3} />
              <ResearcherRow name="Prof. Lisa Johnson" publications={9} acceptances={6} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({
  researcher,
  conference,
  status,
  date,
}: {
  researcher: string;
  conference: string;
  status: string;
  date: string;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Accepted":
        return "bg-success";
      case "Submitted":
        return "bg-accent";
      case "Under Review":
        return "bg-warning";
      default:
        return "bg-secondary";
    }
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div>
        <p className="font-medium">{researcher}</p>
        <p className="text-sm text-muted-foreground">{conference}</p>
      </div>
      <div className="text-right">
        <Badge className={getStatusColor(status)}>{status}</Badge>
        <p className="text-xs text-muted-foreground mt-1">{date}</p>
      </div>
    </div>
  );
}

function ResearcherRow({ name, publications, acceptances }: { name: string; publications: number; acceptances: number }) {
  const acceptanceRate = ((acceptances / publications) * 100).toFixed(0);
  
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <p className="font-medium">{name}</p>
      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground">{publications} publications</span>
        <span className="text-muted-foreground">{acceptances} acceptances</span>
        <Badge variant="secondary">{acceptanceRate}% rate</Badge>
      </div>
    </div>
  );
}
