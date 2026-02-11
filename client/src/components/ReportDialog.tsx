import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Flag, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REPORT_REASONS = [
  { value: "inappropriate_photos", label: "Inappropriate Photos" },
  { value: "harassment", label: "Harassment or Bullying" },
  { value: "fake_profile", label: "Fake Profile" },
  { value: "spam", label: "Spam or Advertising" },
  { value: "underage", label: "Underage User" },
  { value: "offensive_content", label: "Offensive Content" },
  { value: "scam", label: "Scam or Fraud" },
  { value: "other", label: "Other" },
] as const;

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: string;
  reportedUserName: string;
}

export function ReportDialog({ open, onOpenChange, reportedUserId, reportedUserName }: ReportDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const { toast } = useToast();

  const reportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports", {
        reportedUserId,
        reason,
        details: details.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Submitted",
        description: "Thank you. Our team will review this report shortly.",
      });
      onOpenChange(false);
      setReason("");
      setDetails("");
    },
    onError: (error: Error) => {
      const msg = error.message;
      if (msg.includes("already reported")) {
        toast({
          title: "Already Reported",
          description: "You have already reported this user.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Report Failed",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const handleSubmit = () => {
    if (!reason) return;
    reportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <Flag className="w-4 h-4 text-destructive" />
            </div>
            <DialogTitle data-testid="text-report-title">Report {reportedUserName}</DialogTitle>
          </div>
          <DialogDescription>
            Help us keep the community safe. Select a reason for your report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reason for report</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2" data-testid="radio-report-reason">
              {REPORT_REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-3 p-2 rounded-md hover-elevate">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} data-testid={`radio-reason-${r.value}`} />
                  <Label htmlFor={`reason-${r.value}`} className="flex-1 cursor-pointer text-sm">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details" className="text-sm font-medium">
              Additional details (optional)
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide any additional context that may help us investigate..."
              className="resize-none"
              rows={3}
              maxLength={1000}
              data-testid="textarea-report-details"
            />
            <p className="text-xs text-muted-foreground text-right">{details.length}/1000</p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
            <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Reports are reviewed by our safety team. False reports may result in action on your account.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reportMutation.isPending}
            data-testid="button-cancel-report"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason || reportMutation.isPending}
            data-testid="button-submit-report"
          >
            {reportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Flag className="w-4 h-4 mr-2" />
            )}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
