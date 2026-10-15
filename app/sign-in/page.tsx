import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import SignInForm from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </>
  );
}
