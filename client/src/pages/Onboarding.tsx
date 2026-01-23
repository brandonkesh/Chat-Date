import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProfileSchema, type InsertProfile } from "@shared/schema";
import { useUpdateProfile } from "@/hooks/use-dating";
import { useLocation } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { mutateAsync: createProfile, isPending } = useUpdateProfile();

  const form = useForm<InsertProfile>({
    resolver: zodResolver(insertProfileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
      age: 18,
      gender: "male",
      interestedIn: "female",
      photoUrl: "",
    },
  });

  const onSubmit = async (data: InsertProfile) => {
    try {
      await createProfile(data);
      setLocation("/feed");
    } catch (error) {
      // Error handled by hook toast
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-none shadow-xl">
        <CardHeader className="text-center pb-8 pt-8">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            <Heart className="fill-current w-6 h-6" />
          </div>
          <CardTitle className="text-3xl font-display">Create Profile</CardTitle>
          <CardDescription>Tell us about yourself to start matching</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={18} 
                          className="h-12 rounded-xl"
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value))} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="interestedIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interested In</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Men</SelectItem>
                        <SelectItem value="female">Women</SelectItem>
                        <SelectItem value="everyone">Everyone</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="What makes you unique?" 
                        className="min-h-[100px] rounded-xl resize-none" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full h-12 text-lg rounded-full font-semibold shadow-lg shadow-primary/20"
                disabled={isPending}
              >
                {isPending ? "Creating..." : "Start Matching"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
