"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown> | null;
}

interface TenantMember {
  id: string;
  clerk_user_id: string;
  email: string;
  role: string;
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // ---- Organization state ----
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [orgName, setOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);

  // ---- Members state ----
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  // ---- Load tenant info and members ----
  const loadData = useCallback(async () => {
    try {
      const [tenantRes, membersRes] = await Promise.all([
        api.get<TenantInfo>("/api/v1/tenants/me"),
        api.get<TenantMember[]>("/api/v1/tenants/me/members"),
      ]);
      setTenant(tenantRes.data);
      setOrgName(tenantRes.data.name);
      setMembers(membersRes.data);
    } catch {
      // API may not be available yet during dev
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Save org name ----
  async function handleSaveOrg() {
    if (!orgName.trim()) return;
    setSavingOrg(true);
    try {
      const { data } = await api.patch<TenantInfo>("/api/v1/tenants/me", {
        name: orgName,
      });
      setTenant(data);
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 2000);
    } catch {
      // handle error silently
    } finally {
      setSavingOrg(false);
    }
  }

  // ---- Invite member ----
  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post("/api/v1/tenants/me/invite", {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteRole("viewer");
      // Reload members
      const { data } = await api.get<TenantMember[]>("/api/v1/tenants/me/members");
      setMembers(data);
    } catch {
      // handle error silently
    } finally {
      setInviting(false);
    }
  }

  return (
    <PageContainer
      title="Settings"
      description="Manage your workspace settings"
    >
      <div className="space-y-6">
        {/* ----------------------------------------------------------------- */}
        {/* Organization Settings                                              */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Settings</CardTitle>
            <CardDescription>
              Basic workspace configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Organization Name */}
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="org-name"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
                <Button
                  onClick={handleSaveOrg}
                  disabled={savingOrg || orgName === tenant?.name}
                >
                  {savingOrg ? "Saving..." : orgSaved ? "Saved" : "Save"}
                </Button>
              </div>
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <Label>Current Plan</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {tenant?.plan ?? "free"}
                </Badge>
              </div>
            </div>

            {/* Default Currency */}
            <div className="space-y-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Input
                id="currency"
                placeholder="USD"
                disabled
              />
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="America/New_York"
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Team Members                                                       */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage who has access to this workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invite Form */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label htmlFor="invite-email" className="text-xs">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="w-[120px] space-y-1">
                <Label htmlFor="invite-role" className="text-xs">Role</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? "Inviting..." : "Invite"}
              </Button>
            </div>

            {/* Member List */}
            {members.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--foreground-muted)]">
                No team members yet. Invite someone above.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.joined_at ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-400 text-xs">
                            Invited
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-[var(--foreground-muted)]">
                        {m.joined_at
                          ? new Date(m.joined_at).toLocaleDateString()
                          : m.invited_at
                            ? `Invited ${new Date(m.invited_at).toLocaleDateString()}`
                            : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Audit Log                                                          */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>
              Track all user actions across your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/audit">
              <Button variant="outline">
                View Audit Log
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Notifications                                                      */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Notifications</CardTitle>
              <Badge variant="secondary" className="text-xs">
                Coming Soon
              </Badge>
            </div>
            <CardDescription>
              Configure how you receive alerts and updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email notifications */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Email Notifications
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Receive email updates for important events
                </p>
              </div>
              <input
                type="checkbox"
                disabled
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)] text-cyan-500 focus:ring-cyan-500"
              />
            </div>

            {/* Notify on run completion */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Notify on Run Completion
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Get notified when a reconciliation run finishes
                </p>
              </div>
              <input
                type="checkbox"
                disabled
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)] text-cyan-500 focus:ring-cyan-500"
              />
            </div>

            {/* Notify on exceptions */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Notify on Exceptions
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Get alerted when exceptions are detected
                </p>
              </div>
              <input
                type="checkbox"
                disabled
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)] text-cyan-500 focus:ring-cyan-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* API Access                                                         */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>API Access</CardTitle>
              <Badge variant="secondary" className="text-xs">
                Coming Soon
              </Badge>
            </div>
            <CardDescription>
              Manage API keys and webhook configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Key */}
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-3">
                <Input
                  value="sk-****-****-****"
                  disabled
                  className="font-mono"
                />
                <Button variant="outline" disabled>
                  Regenerate
                </Button>
              </div>
              <p className="text-xs text-[var(--foreground-muted)]">
                Use this key to authenticate API requests
              </p>
            </div>

            <Separator />

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook">Webhook URL</Label>
              <Input
                id="webhook"
                placeholder="https://your-app.com/webhooks/recon"
                disabled
              />
              <p className="text-xs text-[var(--foreground-muted)]">
                Receive real-time event notifications via webhook
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Danger Zone                                                        */}
        {/* ----------------------------------------------------------------- */}
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-400">
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-red-500/30 p-4">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Delete Workspace
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Permanently delete this workspace and all associated data.
                  This action cannot be undone.
                </p>
              </div>
              <Button variant="destructive" disabled>
                Delete Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
