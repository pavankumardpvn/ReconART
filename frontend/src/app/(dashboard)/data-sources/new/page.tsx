"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateSource } from "@/hooks/useDataSources";
import PageContainer from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ArrowLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Source type options
// ---------------------------------------------------------------------------

const SOURCE_TYPES = [
  { value: "file_upload", label: "File Upload" },
  { value: "api_connector", label: "API Connector" },
  { value: "database", label: "Database" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreateSourcePage() {
  const router = useRouter();
  const createMutation = useCreateSource();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("file_upload");

  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    createMutation.mutate(
      {
        name: name.trim(),
        source_type: sourceType,
        description: description.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          router.push(`/data-sources/${created.id}`);
        },
      }
    );
  }

  return (
    <PageContainer
      title="Create Data Source"
      description="Set up a new data source container"
      action={
        <Button variant="outline" onClick={() => router.push("/data-sources")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      }
    >
      <Card className="glass-card mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>New Data Source</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Bank Statements"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Source Type */}
            <div className="space-y-2">
              <Label htmlFor="source-type">Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger id="source-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe this data source..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Error */}
            {createMutation.isError && (
              <p className="text-sm text-red-400">
                Failed to create source. Please try again.
              </p>
            )}

            {/* Submit */}
            <Button type="submit" disabled={!canSubmit} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              {createMutation.isPending ? "Creating..." : "Create Data Source"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
