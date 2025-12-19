import { Suspense } from "react";
import Spinner from "../../components/spinner";
import LoginPageClient from "./LoginPageClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F0F0F5]">
          <Spinner />
        </div>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}
