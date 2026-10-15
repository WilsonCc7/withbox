import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import SignUpForm from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </>
  );
}
